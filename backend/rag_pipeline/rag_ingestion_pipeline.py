import os, time, shutil
from .rag_ingestion_functions import partition_document, create_chunks_by_title, process_chunks, create_vector_store

from database import SessionLocal
import models

def update_document_progress(document_id: int, status: str, progress: int, message: str):
  db=SessionLocal()
  try:
    document=db.query(models.ProjectDocument).filter(
      models.ProjectDocument.id==document_id
    ).first()
    if document:
      if status == "PROCESSING":
        document.status = models.DocumentStatus.PROCESSING
      elif status == "COMPLETED":
        document.status = models.DocumentStatus.COMPLETED
      elif status == "FAILED":
        document.status = models.DocumentStatus.FAILED
      document.progress=progress
      document.current_message=message
      db.commit()
  except Exception as e:
    print(f"Failed to update DB progress: {e}")
  finally:
    db.close()

def rag_ingestion(file_path: str, project_id: int, file_name: str, document_id: int):
  start=time.time()
  try:
    print(f"[Project {project_id} | Filename: {file_name}] Step 1: Partitioning document (This might take a minute)...")
    update_document_progress(document_id, "PROCESSING", 10, "Extracting text and tables from PDF...")
    elements=partition_document(file_path)
    if not elements:
      raise ValueError("No text or elements could be extracted from this document.")

    print(f"[Project {project_id} | Filename: {file_name}] Step 2: Creating logical chunks based on title...")
    update_document_progress(document_id, "PROCESSING", 30, "Intelligently chunking document by titles...")
    chunks=create_chunks_by_title(elements)

    print(f"[Project {project_id} | Filename: {file_name}] Step 3: Generating AI summaries & saving images...")
    update_document_progress(document_id, "PROCESSING", 50, "Generating AI enhanced summaries for images/tables...")
    langchain_documents=process_chunks(chunks, project_id, file_name)

    print(f"[Project {project_id} | Filename: {file_name}] Step 4: Embedding and saving to ChromaDB Vault...")
    update_document_progress(document_id, "PROCESSING", 80, "Building Vector Database and BM25 Indices...")
    create_vector_store(langchain_documents, project_id)

    update_document_progress(document_id, "COMPLETED", 100, "Ingestion Complete! Knowledge base is ready.")

    end=time.time()
    print(f"[Project {project_id} | Filename: {file_name}] ✅ Ingestion Complete in {round(end - start, 2)} seconds!")
    return True
  except Exception as e:
    update_document_progress(document_id, "FAILED", 0, f"Error: {str(e)}")
    raise e