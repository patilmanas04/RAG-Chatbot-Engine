from langchain_classic.retrievers import EnsembleRetriever
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.retrievers import BM25Retriever
from langchain_core.prompts import ChatPromptTemplate
import os, pickle

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

  rewriter_llm=ChatGoogleGenerativeAI(model="	gemini-2.5-flash", temperature=0.0)
  rewriter_chain=rewriter_prompt|rewriter_llm

  if formatted_history.strip():
    standalone_query=rewriter_chain.invoke({
      "history": formatted_history,
      "question": user_query
    }).content.strip()
  else:
    standalone_query=user_query

  retrieved_documents=hybrid_retriever.invoke(standalone_query)
  context_text="\n\n".join([doc.page_content for doc in retrieved_documents])

  prompt_template=ChatPromptTemplate.from_messages([
    ("system", """You are an elite, highly intelligent AI knowledge assistant. Your primary directive is to answer the user's questions accurately, comprehensively, and strictly based on the provided Knowledge Base Context.

    <core_rules>
    1. NO HALLUCINATIONS: You must base your answer ONLY on the provided context. Do not use your external training data to invent facts, numbers, or details.
    2. THE "I DON'T KNOW" PROTOCOL: If the context does not contain the information needed to answer the question, you must explicitly state: "I'm sorry, but the provided documents do not contain information about this." Do not attempt to guess.
    3. CONVERSATIONAL MEMORY: Use the provided Chat History to understand the flow of the conversation and resolve pronouns (e.g., if the user asks "What is its cost?", figure out what "its" refers to from the history).
    4. OBJECTIVITY: Maintain a professional, objective, and helpful tone. Do not use filler phrases like "According to the context provided..." just give the answer directly.
    5. CONFLICTING DATA: If the context contains conflicting information, state both pieces of information and mention the discrepancy.
    </core_rules>

    <formatting_guidelines>
    - Structure your answers clearly using Markdown.
    - Use bold text for emphasis on key terms, numbers, or IDs.
    - Use bullet points or numbered lists when explaining steps or listing multiple items.
    - Keep your responses concise but ensure they fully answer the user's query.
    </formatting_guidelines>

    <chat_history>
    {history}
    </chat_history>

    <knowledge_base_context>
    {context}
    </knowledge_base_context>
    """),
    ("human", "{question}")
  ])

  llm=ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3)
  chain=prompt_template|llm

  response=chain.invoke({
    "history": formatted_history,
    "context": context_text,
    "question": user_query
  })

  return response.content