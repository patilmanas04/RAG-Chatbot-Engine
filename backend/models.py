from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

# users table schema
class User(Base):
  __tablename__="users"

  # Columns
  id=Column(Integer, primary_key=True, index=True)
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
  created_at=Column(DateTime(timezone=True), server_default=func.now())