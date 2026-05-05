from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
from schemas import ProjectCreate
from dependencies import get_db, get_current_user
from sqlalchemy.orm import Session
from typing import List
from redis import Redis
from rq import Queue
from schemas import ChatRequest
import models, os, shutil, json

from rag_pipeline.rag_ingestion_pipeline import rag_ingestion
from rag_pipeline.rag_retrieval_pipeline import query_hybrid_rag

redis_connection=Redis(host="localhost", port=6379)
ingestion_queue=Queue("rag_ingestion", connection=redis_connection)

router = APIRouter(
  prefix="/projects",
  tags=["Projects"]
)

# Create project
@router.post("/")
def create_project(
  project_data: ProjectCreate,
  current_user: models.User=Depends(get_current_user),
  db: Session=Depends(get_db)
):
  new_project=models.Project(
    name=project_data.name,
    description=project_data.description,
    owner_id=current_user.id
  )

  db.add(new_project)
  db.commit()
  db.refresh(new_project)

  return {
    "message": "Project created successfully!",
    "project_id": new_project.id,
    "owner": current_user.email
  }

# Upload documents and ingest them in background using redis
@router.post("/{project_id}/documents")
async def upload_documents(
  project_id: int,
  files: List[UploadFile] = File(...),
  db: Session = Depends(get_db),
  current_user: models.User = Depends(get_current_user)
):
  if not files:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="No files uploaded"
    )

  project=db.query(models.Project).filter(
    models.Project.id==project_id,
    models.Project.owner_id==current_user.id
  ).first()

  if not project:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Project not found or unauthorized"
    )
  
  permanent_dir=f"./media/projects/{project_id}/documents"
  os.makedirs(permanent_dir, exist_ok=True)

  job_ids=[]
  document_ids=[]

  for file in files:
    if not file.filename.endswith(".pdf"):
      continue # Skip non-pdf files for now

    file_path=os.path.join(permanent_dir, file.filename)
    with open(file_path, "wb") as buffer:
      shutil.copyfileobj(file.file, buffer)

    new_document=models.ProjectDocument(
      project_id=project_id,
      file_name=file.filename,
      file_path=file_path,
      status=models.DocumentStatus.PENDING,
      progress=0,
      current_message="Queued for background processing..."
    )
    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    # Adding the job into the ingestion_queue with the exact arguments it needs
    # A 10 minute timeout because the Google vision takes some time
    job=ingestion_queue.enqueue(
      rag_ingestion,
      args=(file_path, project_id, file.filename, new_document.id),
      job_timeout="10m"
    )

    new_document.job_id=job.id
    db.commit()

    job_ids.append({"filename": file.filename, "job_id": job.id})
    document_ids.append(new_document.id)

  return {
    "status": "success",
    "message": "Document uploaded and queued for processing.",
    "jobs": job_ids,
    "documents": document_ids
  }

# Chat with the project
@router.post("/{project_id}/chat")
def chat_with_project(
  project_id: int,
  request: ChatRequest,
  current_user: models.User=Depends(get_current_user),
  db: Session=Depends(get_db)
):
  project=db.query(models.Project).filter(
    models.Project.id==project_id,
    models.Project.owner_id==current_user.id
  ).first()

  if not project:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Project not found or unauthorized."
    )
  
  recent_history=db.query(models.ChatMessage).filter(
    models.ChatMessage.project_id==project_id
  ).order_by(models.ChatMessage.id.desc()).limit(10).all()

  recent_history.reverse()

  user_message=models.ChatMessage(
    project_id=project_id,
    role="user",
    content=request.message,
    citations=[]
  )
  db.add(user_message)
  db.commit()

  try:
    raw_ai_response=query_hybrid_rag(
      project_id=project_id,
      user_query=request.message,
      chat_history=recent_history
    )

    parsed_data=json.loads(raw_ai_response)
    answer_text=parsed_data.get("answer", "I encountered an error generating the text.")
    citations_list=parsed_data.get("citations", [])
  except json.JSONDecodeError:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="AI Output Error: Failed to parse structural response."
    )
  except FileNotFoundError as e:
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail=str(e)
    )
  except Exception as e:
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"AI Engine failed: {str(e)}"
    )
  
  ai_message=models.ChatMessage(
    project_id=project_id,
    role="assistant",
    content=answer_text,
    citations=citations_list
  )
  db.add(ai_message)
  db.commit()
  db.refresh(ai_message)

  return {
    "status": "success",
    "data": {
      "role": ai_message.role,
      "content": ai_message.content,
      "citations": ai_message.citations
    }
  }

# Get all the projects for the logged in user
@router.get("/")
def get_all_projects(
  db: Session=Depends(get_db),
  current_user: models.User=Depends(get_current_user)
):
  user_projects=db.query(models.Project).filter(
    models.Project.owner_id==current_user.id
  ).order_by(models.Project.created_at.desc()).all()

  if not user_projects:
    return {
      "status": "success",
      "message": "Welcome! You don't have any projects yet.",
      "data": []
    }
  
  return {
    "status": "success",
    "data": user_projects
  }

# Get the chat history
@router.get("/{project_id}/chat")
def get_chat_history(
  project_id: int,
  db: Session=Depends(get_db),
  current_user: models.User=Depends(get_current_user)
):
  project=db.query(models.Project).filter(
    models.Project.id==project_id,
    models.Project.owner_id==current_user.id
  ).first()

  if not project:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Project not found or unauthorized."
    )
  
  chat_history=db.query(models.ChatMessage).filter(
    models.ChatMessage.project_id==project_id
  ).order_by(models.ChatMessage.id.asc()).all()

  return {
    "status": "success",
    "data": chat_history
  }

# List all the documents of the specified project
@router.get("/{project_id}/documents")
def get_project_documents(
  project_id: int,
  current_user: models.User=Depends(get_current_user),
  db: Session=Depends(get_db)
):
  project=db.query(models.Project).filter(
    models.Project.id==project_id,
    models.Project.owner_id==current_user.id
  ).first()

  if not project:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Project not found or unauthorized"
    )
  
  docs=db.query(models.ProjectDocument).filter(
    models.ProjectDocument.project_id==project_id
  ).all()

  return {
    "status": "success",
    "data": docs
  }

# Serve the actual pdf to the frontend
@router.get("/{project_id}/documents/{document_id}/view")
def view_document(
  project_id: int,
  document_id: int,
  current_user: models.User=Depends(get_current_user),
  db: Session=Depends(get_db)
):
  project=db.query(models.Project).filter(
    models.Project.id==project_id,
    models.Project.owner_id==current_user.id
  ).first()

  if not project:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Project not found or unauthorized"
    )
  
  doc=db.query(models.ProjectDocument).filter(
    models.ProjectDocument.project_id==project_id,
    models.ProjectDocument.id==document_id
  ).first()

  if not doc or not os.path.exists(doc.file_path):
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="File not found on server"
    )
  
  return FileResponse(
    path=doc.file_path,
    media_type="application/pdf",
    filename=doc.file_name
  )

# Get the current status of the document being processed
@router.get("/{project_id}/documents/{document_id}/status")
def get_document_status(
  project_id: int,
  document_id: int,
  current_user: models.User=Depends(get_current_user),
  db: Session=Depends(get_db)
):
  project=db.query(models.Project).filter(
    models.Project.id==project_id,
    models.Project.owner_id==current_user.id
  ).first()

  if not project:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Project not found or unauthorized."
    )
  
  document=db.query(models.ProjectDocument).filter(
    models.ProjectDocument.id==document_id,
    models.ProjectDocument.project_id==project_id
  ).first()

  if not document:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail="Document not found."
    )
  
  return {
    "status": "success",
    "data": {
      "document_id": document.id,
      "file_name": document.file_name,
      "ingestion_status": document.status,
      "progress": document.progress,       
      "current_message": document.current_message
    }
  }