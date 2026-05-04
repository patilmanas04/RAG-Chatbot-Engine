import os, time, shutil
from .rag_ingestion_functions import partition_document, create_chunks_by_title, process_chunks, create_vector_store

from database import SessionLocal
import models

def rag_ingestion(file_path: str, project_id: int):
  start=time.time()
  try:
    print(f"[Project {project_id}] Step 1: Partitioning document (This might take a minute)...")
    elements=partition_document(file_path)
    if not elements:
      raise ValueError("No text or elements could be extracted from this document.")

    print(f"[Project {project_id}] Step 2: Creating logical chunks based on title...")
    chunks=create_chunks_by_title(elements)

    print(f"[Project {project_id}] Step 3: Generating AI summaries & saving images...")
    langchain_documents=process_chunks(chunks, project_id)

    print(f"[Project {project_id}] Step 4: Embedding and saving to ChromaDB Vault...")
    create_vector_store(langchain_documents, project_id)

    print(f"[Project {project_id}] Step 5: Permanently saving document...")
    permanent_dir = f"./media/projects/{project_id}/documents"
    os.makedirs(permanent_dir, exist_ok=True)
    filename = os.path.basename(file_path)
    permanent_path = os.path.join(permanent_dir, filename)
    shutil.move(file_path, permanent_path)

    db=SessionLocal()
    try:
      new_document=models.ProjectDocument(
        project_id=project_id,
        file_name=filename,
        file_path=permanent_path,
      )
      db.add(new_document)
      db.commit()
      print(f"[Project {project_id}] 💾 Document logged in database!")
    finally:
      db.close()

    end=time.time()
    print(f"[Project {project_id}] ✅ Ingestion Complete in {round(end - start, 2)} seconds!")
    return True
  except Exception as e:
    raise e
  finally:
    if os.path.exists(file_path):
        os.remove(file_path)
        print(f"[Project {project_id}] 🧹 Ingestion failed. Cleaned up temp file.")