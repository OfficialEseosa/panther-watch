import type { NextRequest } from "next/server";
import { deleteGradeTerm } from "@/lib/admin/grades";
import { guardAdmin, handleErrors, notFound } from "@/lib/admin/route";

interface Context {
  params: Promise<{ term: string }>;
}

/** DELETE /api/admin/grades/:term -> 204 (term and its section grades removed) | 404 */
export async function DELETE(request: NextRequest, { params }: Context) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request, { mutation: true });
    if (guard.response) return guard.response;
    const { term } = await params;
    return (await deleteGradeTerm(term)) ? new Response(null, { status: 204 }) : notFound();
  });
}
