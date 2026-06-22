-- Create the function to search documents using cosine similarity
-- (Drop the function first if you are recreating it)
-- drop function if exists match_documents;
create function match_documents (
  query_embedding vector(1536), -- Matches the embedding dimensions
  match_count int DEFAULT 5,    -- How many results to return (defaults to 5)
  match_threshold float DEFAULT 0.3, -- Ensures that only documents that have a minimum similarity to the query_embedding are returned. 
  filter jsonb DEFAULT '{}'     -- Placeholder for future metadata filtering (not used currently)
) returns table (
  id bigint,
  content text,
  metadata jsonb, -- Return the metadata along with the content
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    documents.id,
    documents.content,
    documents.metadata,
    -- Calculate cosine similarity (1 - cosine distance)
    -- <=> is the cosine distance operator
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  -- Optional: Add a WHERE clause to filter by metadata if needed in the future
  -- e.g., where documents.metadata @> filter
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding -- Order by cosine distance (closest first)
  limit match_count; -- Limit the number of results
end;
$$;
