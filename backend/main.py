from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine
import models
from routers import projects, auth

# Create tables in the database only when they does not exists
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
  title="Multi-Tenant RAG Platform",
  description="The core backend engine for document ingestion and AI chat.",
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["http://localhost:3000", "http://localhost:5173"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)

@app.get("/")
def health_check():
  return {
    "status": "online",
    "message": "The RAG Backend is alive and connected to TiDB."
  }