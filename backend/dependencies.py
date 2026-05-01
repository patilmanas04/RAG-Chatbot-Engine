from fastapi import HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from database import SessionLocal
import jwt, os, models

load_dotenv()

SECRET_KEY=os.getenv("SECRET_KEY")
ALGORITHM=os.getenv("ALGORITHM")
oauth2_scheme=OAuth2PasswordBearer(tokenUrl="login")

# Get the database running instance
def get_db():
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()

# Authenticates and validates the JWT AUTH TOKEN
def get_current_user(token:str=Depends(oauth2_scheme), db:Session=Depends(get_db)):
  credentials_exception=HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials, please login again.",
    headers={"WWW-Authenticate": "Bearer"}
  )

  try:
    payload=jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id: str=payload.get("sub")
    if user_id is None:
      raise credentials_exception
  except jwt.ExpiredSignatureError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired, please login again.")
  except jwt.InvalidTokenError:
    raise credentials_exception
  
  user=db.query(models.User).filter(models.User.id==str(user_id)).first()
  if user is None:
    raise credentials_exception
  
  return user