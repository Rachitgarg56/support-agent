import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "The request is invalid." } },
      { status: 400 },
    );
  }

  console.error("Unhandled API error", error);
  return NextResponse.json(
    {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message:
          "The demo service is temporarily unavailable. The free database may be paused; please try again later.",
      },
    },
    { status: 503 },
  );
}

export function safeErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Document processing failed.";
  const message = error.message.toLowerCase();
  if (message.includes("password") || message.includes("encrypted")) {
    return "Encrypted or password-protected PDFs are not supported.";
  }
  if (error instanceof ApiError) return error.message;
  return "The file could not be processed. Check that it contains readable text and try again.";
}
