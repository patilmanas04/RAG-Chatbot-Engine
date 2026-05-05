from langchain_classic.retrievers import EnsembleRetriever
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from dotenv import load_dotenv
import os, pickle, time

load_dotenv()

def query_hybrid_rag(project_id: int, user_query: str, chat_history: list):
  embedding_model=HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
  vector_store=Chroma(
    persist_directory="dbv1/chromadb",
    collection_name=f"project_vault_{project_id}",
    collection_metadata={"hnsw:space": "cosine"},
    embedding_function=embedding_model
  )
  vector_retriever=vector_store.as_retriever(search_kwargs={"k": 5})

  bm25_file_path=f"dbv1/bm25_indices/project_vault_{project_id}.pkl"

  if not os.path.exists(bm25_file_path):
    raise FileNotFoundError("Vault Empty: No documents have been uploaded to this project yet.")
  
  with open(bm25_file_path, "rb") as f:
    bm25_retriever=pickle.load(f)

  bm25_retriever.k=5

  hybrid_retriever=EnsembleRetriever(
    retrievers=[bm25_retriever, vector_retriever],
    weights=[0.3, 0.7]
  )

  formatted_history=""
  for message in chat_history:
    formatted_history+=f"{message.role.upper()}: {message.content}\n"

  rewriter_prompt=ChatPromptTemplate.from_messages([
    ("system", """Given the following chat history and the user's latest question, 
    formulate a standalone question that can be understood entirely without the chat history. 
    Do NOT answer the question. Just reformulate it to include the missing context (like replacing pronouns with the actual nouns). 
    If the question is already clear and self-contained, return it exactly as it is."""),
    ("human", "Chat History:\n{history}\n\nLatest Question: {question}")
  ])

  rewriter_llm=ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite-preview",
    temperature=0.0,
    max_retries=3
  )
  rewriter_chain=rewriter_prompt|rewriter_llm

  if formatted_history.strip():
    standalone_query=rewriter_chain.invoke({
      "history": formatted_history,
      "question": user_query
    }).content
    # time.sleep(2)
    if isinstance(standalone_query, list):
      standalone_query=standalone_query[0].get("text", str(standalone_query))
  else:
    standalone_query=user_query

  retrieved_documents=hybrid_retriever.invoke(standalone_query)

  formatted_context_chunks=[]
  for doc in retrieved_documents:
    source_file=doc.metadata.get("source_file", "Unknown Document")
    page_number=doc.metadata.get("page_number", 1)
    is_synthetic=doc.metadata.get("is_synthetic", False)
    formatted_chunk=f"[SOURCE: {source_file}] | PAGE: {page_number} | IS_SYNTHETIC: {is_synthetic}]\n{doc.page_content}"
    formatted_context_chunks.append(formatted_chunk)

  context_text="\n\n".join(formatted_context_chunks)

  prompt_template=ChatPromptTemplate.from_messages([
    ("system", """You are an elite AI knowledge assistant. You must answer questions based ONLY on the provided context.

    CRITICAL INSTRUCTION: You MUST return your answer entirely as a valid JSON object. Do NOT wrap it in markdown blockticks (like ```json), just return the raw JSON. 
    
    The JSON must strictly follow this schema:
    {{
      "answer": "Your detailed markdown-formatted answer goes here.",
      "citations": [
        {{
          "source_file": "The filename from the context tag",
          "page_number": The page number from the context tag (integer),
          "exact_quote": "A short, exact substring (max 8-10 words) from the text to prove the claim. IF IS_SYNTHETIC IS TRUE, THIS MUST BE NULL."
        }}
      ]
    }}

    <core_rules>
    1. NO HALLUCINATIONS: Base answers ONLY on the context.
    2. THE SYNTHETIC RULE: If the context block says 'IS_SYNTHETIC: True', it means the text is an AI description of a visual chart or table. You CANNOT quote it verbatim from the PDF. You MUST set "exact_quote" to null.
    3. SNIPPET OPTIMIZATION: If 'IS_SYNTHETIC: False', extract the minimum unique substring (max 10 words) required to locate the claim. Do not copy whole paragraphs.
    </core_rules>

    <chat_history>
    {history}
    </chat_history>

    <knowledge_base_context>
    {context}
    </knowledge_base_context>
    """),
    ("human", "{question}")
  ])

  llm=ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite-preview",
    temperature=0.3,
    response_mime_type="application/json",
    max_retries=3
  )
  chain=prompt_template|llm

  response=chain.invoke({
    "history": formatted_history,
    "context": context_text,
    "question": user_query
  })

  raw_content=response.content
  if isinstance(raw_content, list):
    raw_content=raw_content[0].get("text", str(raw_content))

  return raw_content