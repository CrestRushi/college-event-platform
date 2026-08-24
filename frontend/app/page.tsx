'use client';
import { FormEvent, useEffect, useState } from 'react';

type Event = { id: number; name: string; description: string };
type ServerInfo = { serverName: string; hostname: string; timestamp: string; database: string; s3: string };
type Registration = { registration_id: string; full_name: string; email: string; phone: string; college_name: string; event_name: string; created_at: string; document_s3_key: string | null };
// Leave this empty in AWS so the browser uses the same ALB/Nginx origin for /api.
const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [success, setSuccess] = useState<{ registrationId: string; handledBy: string } | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Registration[] | null>(null); const [searchMessage, setSearchMessage] = useState(''); const [searching, setSearching] = useState(false);
  const load = async () => { try { const [eventData, serverData] = await Promise.all([fetch(`${API}/api/events`).then(r => r.json()), fetch(`${API}/api/server-info`).then(r => r.json())]); setEvents(eventData); setServer(serverData); } catch { setError('Cannot reach the API. Start the backend and refresh.'); } };
  useEffect(() => { load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setLoading(true);
    // Save the form before awaiting: React's event currentTarget is not reliable afterward.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try { const response = await fetch(`${API}/api/registrations`, { method: 'POST', body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.message); setSuccess(data); formElement.reset(); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Registration failed.'); } finally { setLoading(false); }
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSearching(true); setSearchMessage(''); setResults(null);
    const data = new FormData(event.currentTarget); const parameters = new URLSearchParams();
    const registrationId = String(data.get('registrationId') || '').trim(); const email = String(data.get('searchEmail') || '').trim();
    if (registrationId) parameters.set('registrationId', registrationId); if (email) parameters.set('email', email);
    try { const response = await fetch(`${API}/api/registrations/search?${parameters}`); const body = await response.json(); if (!response.ok) throw new Error(body.message); setResults(body.registrations); if (!body.registrations.length) setSearchMessage('No registrations matched those details.'); }
    catch (e) { setSearchMessage(e instanceof Error ? e.message : 'Search failed.'); } finally { setSearching(false); }
  }
  return <main>
    <header className="bg-[#071b36] text-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><div><p className="text-xs font-bold tracking-[.2em] text-blue-200">COLLEGE EVENT REGISTRATION PLATFORM</p><h1 className="mt-1 text-xl font-bold">College Tech Fest 2026</h1></div><div className="rounded-full bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-200">● Running on: {server?.serverName || 'Connecting...'}</div></div></header>
    <section className="bg-gradient-to-br from-[#0b2d59] to-[#1769e0] px-6 py-14 text-white"><div className="mx-auto max-w-6xl"><p className="font-semibold text-blue-200">LEARN · BUILD · COMPETE</p><h2 className="mt-2 max-w-2xl text-4xl font-extrabold">One festival. Five opportunities to make your mark.</h2><p className="mt-4 max-w-xl text-blue-100">Register for a College Tech Fest event and see a real AWS-ready application architecture in action.</p></div></section>
    <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[1.1fr_.9fr]">
      <section><h2 className="text-2xl font-bold">Available events</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{events.map(item => <article className="card p-5" key={item.id}><h3 className="font-bold text-[#071b36]">{item.name}</h3><p className="mt-2 text-sm text-slate-600">{item.description}</p></article>)}</div></section>
      <section className="card p-6"><h2 className="text-2xl font-bold text-[#071b36]">Register now</h2><p className="mt-1 text-sm text-slate-600">Secure your place at Tech Fest 2026.</p>{success && <div className="mt-5 rounded-lg bg-emerald-50 p-4 text-emerald-900"><b>Registration successful! 🎉</b><br />Registration ID: {success.registrationId}<br />Handled by: {success.handledBy}</div>}{error && <div className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        <form className="mt-5 grid gap-4" onSubmit={submit}><div><label htmlFor="fullName">Full Name</label><input id="fullName" name="fullName" required /></div><div><label htmlFor="email">Email</label><input id="email" name="email" type="email" required /></div><div><label htmlFor="phone">Phone Number</label><input id="phone" name="phone" required /></div><div><label htmlFor="collegeName">College Name</label><input id="collegeName" name="collegeName" required /></div><div><label htmlFor="eventId">Select Event</label><select id="eventId" name="eventId" required defaultValue=""><option value="" disabled>Select an event</option>{events.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div><div><label htmlFor="document">Document / Payment Receipt <span className="font-normal">(optional, 10 MB max)</span></label><input id="document" name="document" type="file" /></div><button disabled={loading} className="rounded-lg bg-[#1769e0] px-5 py-3 font-bold text-white hover:bg-[#1256b7] disabled:opacity-60">{loading ? 'Submitting...' : 'Register Now'}</button></form>
      </section>
    </div>
    <section className="mx-auto max-w-6xl px-6 pb-2"><div className="card p-6"><h2 className="text-xl font-bold text-[#071b36]">Find your registration</h2><p className="mt-1 text-sm text-slate-600">Enter your registration ID, email address, or both.</p><form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={search}><div><label htmlFor="registrationId">Registration ID</label><input id="registrationId" name="registrationId" placeholder="REG-12345678" /></div><div><label htmlFor="searchEmail">Email</label><input id="searchEmail" name="searchEmail" type="email" placeholder="you@example.com" /></div><button disabled={searching} className="self-end rounded-lg bg-[#071b36] px-5 py-3 font-bold text-white disabled:opacity-60">{searching ? 'Searching...' : 'Search'}</button></form>{searchMessage && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{searchMessage}</p>}{results && results.length > 0 && <div className="mt-5 grid gap-3">{results.map(item => <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" key={item.registration_id}><div className="flex flex-wrap justify-between gap-2"><b className="text-emerald-950">{item.registration_id}</b><span className="text-sm text-slate-600">{new Date(item.created_at).toLocaleString()}</span></div><p className="mt-2 font-semibold">{item.full_name} · {item.event_name}</p><p className="text-sm text-slate-700">{item.email} · {item.phone} · {item.college_name}</p><p className="mt-1 text-xs text-slate-500">Document: {item.document_s3_key ? 'Uploaded' : 'Not uploaded'}</p></article>)}</div>}</div></section>
    <section className="mx-auto max-w-6xl px-6 pb-12"><div className="card p-6"><h2 className="text-xl font-bold text-[#071b36]">AWS Architecture Demo</h2><div className="my-6 grid items-center gap-3 text-center text-sm font-bold text-[#1769e0] sm:grid-cols-5"><span>Application Load Balancer</span><span>↓</span><span>Server 1 / Server 2</span><span>↓</span><span>Amazon RDS + S3</span></div><div className="grid gap-3 text-sm sm:grid-cols-4"><Status label="Application" value="Running" good /><Status label="Current Server" value={server?.serverName || 'Loading'} good /><Status label="Database" value={server?.database || 'Checking'} good={server?.database === 'connected'} /><Status label="File Storage" value={server?.s3 || 'Checking'} good={server?.s3 === 'configured'} /></div>{server && <p className="mt-5 text-xs text-slate-500">Current request: {server.hostname} · {new Date(server.timestamp).toLocaleString()}</p>}</div></section>
  </main>;
}
function Status({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-800"><span className={good ? 'text-emerald-500' : 'text-amber-500'}>●</span> {value}</p></div>; }
