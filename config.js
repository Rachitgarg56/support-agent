import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("Google Api key is missing or invalid.");
}

export const googleGenAI = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// Supabase config
const supabasePrivateKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabasePrivateKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing or invalid');
const url = process.env.SUPABASE_URL;
if (!url) throw new Error('SUPABASE_URL is missing or invalid');
export const supabase = createClient(url, supabasePrivateKey);