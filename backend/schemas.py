from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
  email: EmailStr
  password: str

class Token(BaseModel):
  access_token: str
  token_type: str

class ProjectCreate(BaseModel):
  name: str
  description: str | None = None

class ChatRequest(BaseModel):
  message: str