from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

TIDB_URL = os.getenv("TIDB_URL")

engine = create_engine(
  TIDB_URL,
  connect_args={
    "ssl":{
      "ssl_verify_cert": True,
      "ssl_verify_identity": True
    }
  }
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()