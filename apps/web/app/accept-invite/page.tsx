"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useApp } from "@/components/providers";
export default function AcceptInvitePage(){const router=useRouter(),{refresh}=useApp();const [token,setToken]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);async function accept(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{await apiFetch("/api/v1/invitations/accept",{method:"POST",body:JSON.stringify({token})});await refresh();router.replace("/dashboard")}catch(e){setError(e instanceof Error?e.message:"Invitation failed")}finally{setBusy(false)}}return <main className="onboarding-page"><section className="onboarding-card"><span className="brand-mark big"><Sparkles/></span><h1>Accept invitation</h1><p>Sign in using the invited email, then paste the one-time invitation token.</p><form className="form-stack" onSubmit={accept}>{error&&<p className="form-error">{error}</p>}<label>Invitation token<textarea rows={4} value={token} onChange={e=>setToken(e.target.value.trim())} required/></label><button className="primary-button auth-submit" disabled={busy}>{busy?"Joining…":"Join workspace"}</button></form></section></main>}
