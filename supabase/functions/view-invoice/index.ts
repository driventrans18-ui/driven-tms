// Invoice open-tracking redirect. The driver embeds a URL like
// https://<project>.supabase.co/functions/v1/view-invoice?id=<uuid>
// in the email / SMS they send. When the recipient clicks, this
// function (a) bumps last_viewed_at + view_count on the invoice and
// (b) 302-redirects the browser to a fresh signed URL for the most
// recent archived PDF.
//
// No auth required on the recipient side — anyone with the link can
// view the PDF, same as a signed URL. RLS lets anon update only the
// two counter columns via the service-role key below.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(req.url)
  const id  = url.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400, headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Bump the counters first — if the redirect to the PDF fails for some
  // reason, we still have a record that someone tried to open it.
  try {
    const { data: row } = await supabase.from('invoices')
      .select('view_count')
      .eq('id', id)
      .maybeSingle()
    await supabase.from('invoices').update({
      last_viewed_at: new Date().toISOString(),
      view_count:     ((row as any)?.view_count ?? 0) + 1,
    }).eq('id', id)
  } catch (e) {
    console.warn('view-invoice: failed to log view', e)
  }

  // Find the most recent PDF archived under this invoice's folder.
  const { data: files, error: listErr } = await supabase.storage
    .from('invoice-pdfs')
    .list(id, { limit: 1, sortBy: { column: 'created_at', order: 'desc' } })
  if (listErr || !files || files.length === 0) {
    return new Response('PDF not found — it may not have been generated yet.', { status: 404, headers: CORS })
  }

  const path = `${id}/${files[0].name}`
  const { data: signed, error: signErr } = await supabase.storage
    .from('invoice-pdfs')
    .createSignedUrl(path, 60 * 60) // 1 hour is plenty; recipient opens immediately after clicking
  if (signErr || !signed?.signedUrl) {
    return new Response('Could not sign PDF URL', { status: 500, headers: CORS })
  }

  return Response.redirect(signed.signedUrl, 302)
})
