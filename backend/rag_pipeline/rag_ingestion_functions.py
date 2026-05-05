from unstructured.partition.pdf import partition_pdf
from unstructured.chunking.title import chunk_by_title

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.retrievers import BM25Retriever

import base64, uuid, os, json, pickle, time

from dotenv import load_dotenv

load_dotenv()

# --- PDF PARTITIONING INTO ATOM ELEMENTS ---
def partition_document(file_path: str):
  """Converting all whole document into individual small Atom elements"""
  try:
    elements=partition_pdf(
      filename=file_path,
      strategy="hi_res", # Most accurate processing method for extraction
      infer_table_structure=True, # Keep the tables as structured HTML
      extract_image_block_types=["Image"], # Extract the images found in the pdf
      extract_image_block_to_payload=True # Extract images in base64 data
    )
    return elements
  except Exception as e:
    raise e

# --- CREATING CHUNKS BASED ON TITLES ---
def create_chunks_by_title(elements):
  """Creating intelligent chunks using the title-based strategy"""
  chunks = chunk_by_title(
    elements=elements,
    max_characters=3000, # Hard limit - never exceed 3000 characters per chunk
    new_after_n_chars=2400, # Try to start a new chunk after 2400 characters
    combine_text_under_n_chars=600 # Merge tiny chunks under 600 chars with neighbors
  )

  return chunks

# -- SEPARATE CHUNK CONTENTS INTO TEXT, IMAGES, TABLES AND CREATE A DICTIONARY OF IT ---
def separate_content_types_from_chunk(chunk):
  """Analyze and separate different types of elements in the chunk"""
  content_data={
    'text': chunk.text,
    'tables': [],
    'images': [],
    'types': ['text']
  }

  if hasattr(chunk, 'metadata') and hasattr(chunk.metadata, 'orig_elements'):
    for element in chunk.metadata.orig_elements:
      element_dict=element.to_dict()
      element_type=element_dict["type"]

      if element_type=="Table":
        content_data['types'].append('table')
        content_data['tables'].append(element_dict["metadata"]["text_as_html"])

      if element_type=="Image":
        if hasattr(element, 'metadata') and hasattr(element.metadata, 'image_base64'):
          content_data['types'].append('image')
          content_data['images'].append(element_dict["metadata"]["image_base64"])

  content_data['types']=list(set(content_data['types']))
  return content_data

# --- AI ENHANCED SUMMARY OF COMPLEX CHUNKS WHICH CONTAIN IMAGES OR TABLES ---
def create_ai_enhanced_summary(content_data_of_chunk):
  """Create AI enhanced summary for composite content"""
  text=content_data_of_chunk["text"]
  tables=content_data_of_chunk["tables"]
  images=content_data_of_chunk["images"]
  try:
    llm=ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite-preview", temperature=0.3)

    prompt=f"""You are creating a searchable description for document content retrieval.
    YOUR TASK:
    Generate a comprehensive, searchable description that covers:

    1. Key facts, numbers, and data points from text and tables
    2. Main topics and concepts discussed  
    3. Questions this content could answer
    4. Visual content analysis (charts, diagrams, patterns in images)
    5. Alternative search terms users might use

    Make it detailed and searchable - prioritize findability over brevity.

    CONTENT TO ANALYZE:
    TEXT CONTENT:
    {text}
    """

    if tables:
      prompt+="\nTABLES:\n"
      for i, table in enumerate(tables, 1):
        prompt+=f"Table {i}:\n{table}\n\n"
      
    message_content=[{"type": "text", "text": prompt}]

    if images:
      for image_base64 in images:
        message_content.append({
          "type": "image_url",
          "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
        })

    message=HumanMessage(content=message_content)
    response=llm.invoke([message])

    return response.content
  except Exception as e:
    summary=f"{text}"
    if tables:
      summary+=f" [Contains {len(tables)} tables]"
    if images:
      summary+=f" [Contains {len(images)} images]"
    return summary

# -- PROCESS ALL CHUNKS AND CREATE AI ENHANCED SUMMARIES WHEREVER NEEDED AND CONVERT THEM INTO LANGCHAIN DOCUMENTS ---
def process_chunks(chunks, project_id: int, file_name: str):
  """Process all chunks with AI Summary"""
  langchain_documents=[]

  project_media_dir=f"./media/projects/{project_id}"
  os.makedirs(project_media_dir, exist_ok=True)

  for chunk in chunks:
    content_data_of_chunk=separate_content_types_from_chunk(chunk)

    saved_image_paths=[]
    if content_data_of_chunk["images"]:
      for image_base64 in content_data_of_chunk["images"]:
        try:
          image_data=base64.b64decode(image_base64)

          image_filename=f"{uuid.uuid4().hex}.jpg"
          image_filepath=os.path.join(project_media_dir, image_filename)

          with open(image_filepath, "wb") as f:
            f.write(image_data)

          saved_image_paths.append(image_filepath)
        except Exception as e:
          continue

    has_visuals=bool(content_data_of_chunk['images'] or content_data_of_chunk['tables'])

    if has_visuals:
      try:
        enhanced_summary=create_ai_enhanced_summary(content_data_of_chunk)
        time.sleep(2) # Sleep for 2 seconds and them again start working just to respect the Gemini API Rate Limit
      except Exception as e:
        enhanced_summary=content_data_of_chunk["text"]
    else:
      enhanced_summary=content_data_of_chunk["text"]

    page_numbers=[]
    if hasattr(chunk, 'metadata') and hasattr(chunk.metadata, 'orig_elements'):
      for element in chunk.metadata.orig_elements:
        if hasattr(element, 'metadata') and hasattr(element.metadata, 'page_number') and element.metadata.page_number:
          page_numbers.append(element.metadata.page_number)

    starting_page=min(page_numbers) if page_numbers else 1

    langchain_doc=Document(
      page_content=enhanced_summary,
      metadata={
        "project_id": project_id,
        "source_file": file_name,
        "page_number": starting_page,
        "is_synthetic": has_visuals
      }
    )

    langchain_documents.append(langchain_doc)
  return langchain_documents

# --- FINAL STEP: CONVERTING CHUNKS INTO VECTOR EMBEDDIGNS AND SAVING THEM INTO VECTOR STORE ---  
def create_vector_store(langchain_documents, project_id: int, persist_directory="dbv1/chromadb"):
  """Create and persist ChromaDB vector store"""
  try:
    embedding_model=HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    collection_name=f"project_vault_{project_id}"
    vector_store=Chroma(
      persist_directory=persist_directory,
      collection_name=collection_name,
      embedding_function=embedding_model,
      collection_metadata={"hnsw:space": "cosine"}
    )

    vector_store.add_documents(langchain_documents)

    bm25_file_path=f"./dbv1/bm25_indices/project_vault_{project_id}.pkl"
    os.makedirs(os.path.dirname(bm25_file_path), exist_ok=True)

    all_documents_for_bm25=langchain_documents

    if os.path.exists(bm25_file_path):
      with open(bm25_file_path, "rb") as f:
        old_retriever=pickle.load(f)
      old_langchain_documents=old_retriever.docs
      all_documents_for_bm25=old_langchain_documents+langchain_documents

    new_bm25_retriever=BM25Retriever.from_documents(all_documents_for_bm25)
    with open(bm25_file_path, "wb") as f:
      pickle.dump(new_bm25_retriever, f)
  except Exception as e:
    raise e