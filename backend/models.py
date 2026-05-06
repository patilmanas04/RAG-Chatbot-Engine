from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, JSON, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class DocumentStatus(str, enum.Enum):
  PENDING = "PENDING"       # Waiting for the RQ worker to pick it up
  PROCESSING = "PROCESSING" # Currently being chunked/embedded
  COMPLETED = "COMPLETED"   # Ready for RAG chat
  FAILED = "FAILED"         # Something blew up in the pipeline

# users table schema
class User(Base):
  __tablename__="users"

  # Columns
  id=Column(Integer, primary_key=True, index=True)
  first_name=Column(String(100), nullable=False)
  last_name=Column(String(100), nullable=False)
  email=Column(String(255), unique=True, index=True)
  password=Column(String(255))
  is_active=Column(Boolean, default=True)
  created_at=Column(DateTime(timezone=True), server_default=func.now())

  # Table Join with "projects" table
  projects=relationship("Project", back_populates="owner")

# projects table schema
class Project(Base):
  __tablename__="projects"

  # Columns
  id=Column(Integer, primary_key=True, index=True)
  name=Column(String(255), index=True)
  description=Column(Text)
  created_at=Column(DateTime(timezone=True), server_default=func.now())

  # Foreign Key
  owner_id=Column(Integer, ForeignKey("users.id"))

  # Table Join with "users" table
  owner=relationship("User", back_populates="projects")

# chat_messages table schema
class ChatMessage(Base):
  __tablename__="chat_messages"

  id=Column(Integer, primary_key=True, index=True)
  project_id=Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
  role=Column(String(50))
  content=Column(Text)
  citations=Column(JSON, default=[])
  created_at=Column(DateTime(timezone=True), server_default=func.now())

class ProjectDocument(Base):
  __tablename__="project_documents"

  id=Column(Integer, primary_key=True, index=True)
  project_id=Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"))
  file_name=Column(String(255))
  file_path=Column(String(500))
  job_id=Column(String(255), nullable=True, index=True)
  status=Column(Enum(DocumentStatus), default=DocumentStatus.PENDING)
  progress=Column(Integer, default=0)
  current_message=Column(String(500), default="Waiting in background queue...")
  created_at=Column(DateTime(timezone=True), server_default=func.now())