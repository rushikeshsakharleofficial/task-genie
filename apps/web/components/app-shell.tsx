"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarDays, ChartNoAxesCombined, ChevronDown, FolderKanban, Inbox, LayoutDashboard, ListTodo, LogOut, Mail, Menu, Search, Settings, SlidersHorizontal, Sparkles, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "./providers";
import { Avatar, LoadingState } from "./ui";
import { apiFetch, initials, type Notification, type Project } from "@/lib/api";
import { useRealtime, useRealtimeEvent } from "./realtime-provider";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-tasks", label: "My Tasks", icon: ListTodo },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { href: "/posts-emails", label: "Posts & Emails", icon: Mail },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname=usePathname(); const router=useRouter(); const {session,workspace,workspaces,loading,selectWorkspace,signOut}=useApp(); const realtime=useRealtime();
  const [mobileOpen,setMobileOpen]=useState(false); const [projects,setProjects]=useState<Project[]>([]); const [unread,setUnread]=useState(0);
  useEffect(()=>{ if(!loading&&!session) router.replace("/login"); else if(!loading&&session&&!workspace&&pathname!=="/onboarding") router.replace("/onboarding"); },[loading,session,workspace,pathname,router]);
  useEffect(()=>{ if(!workspace) return; void Promise.all([apiFetch<Project[]>(`/api/v1/workspaces/${workspace.id}/projects`),apiFetch<Notification[]>(`/api/v1/workspaces/${workspace.id}/notifications`)]).then(([p,n])=>{setProjects(p);setUnread(n.filter(x=>!x.readAt).length);}).catch(()=>undefined); },[workspace]);
  useRealtimeEvent((event)=>{ if(!workspace||event.workspaceId!==workspace.id)return; if(["project","member","notification"].includes(event.entityType)){void Promise.all([apiFetch<Project[]>(`/api/v1/workspaces/${workspace.id}/projects`),apiFetch<Notification[]>(`/api/v1/workspaces/${workspace.id}/notifications`)]).then(([p,n])=>{setProjects(p);setUnread(n.filter(x=>!x.readAt).length);}).catch(()=>undefined);}});
  if(loading||!session||!workspace) return <LoadingState label="Opening Task Genie…"/>;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen?"sidebar-open":""}`}>
      <div className="brand-row"><Link href="/dashboard" className="brand"><span className="brand-mark"><Sparkles size={18}/></span><span>Task Genie</span></Link><button className="icon-button mobile-only" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div>
      <div className="workspace-picker"><select value={workspace.id} onChange={e=>selectWorkspace(e.target.value)}>{workspaces.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14}/></div>
      <nav className="sidebar-nav">{nav.map(({href,label,icon:Icon})=><Link key={href} href={href} onClick={()=>setMobileOpen(false)} className={`nav-item ${pathname===href?"active":""}`}><Icon size={18}/><span>{label}</span>{label==="Inbox"&&unread>0&&<span className="nav-badge">{unread}</span>}</Link>)}</nav>
      <div className="sidebar-divider"/><div className="sidebar-section-title"><span>Projects</span><Link href="/projects" className="tiny-button">+</Link></div><div className="project-links">{projects.slice(0,7).map(p=><Link href={`/my-tasks?projectId=${p.id}`} key={p.id}><span className="project-dot" style={{background:p.color??"#94a3b8"}}/>{p.name}</Link>)}</div>
      <div className="upgrade-card"><Sparkles size={21}/><strong>Self-hosted Edition</strong><p>Your data stays on your VPS.</p><button className="secondary-button wide" onClick={()=>void signOut().then(()=>router.replace("/login"))}><LogOut size={15}/> Sign out</button></div>
    </aside>
    <div className="app-main"><header className="topbar"><button className="icon-button mobile-only" onClick={()=>setMobileOpen(true)}><Menu size={20}/></button><div className="global-search"><Search size={17}/><input placeholder="Search tasks, projects, people..."/><kbd>⌘ K</kbd></div><div className="topbar-spacer"/><span className={`realtime-status realtime-${realtime.status}`}><i/>{realtime.status==="connected"?"Live":realtime.status}</span><button className="toolbar-button"><SlidersHorizontal size={16}/>Filter</button><button className="toolbar-button hide-small"><CalendarDays size={16}/>This Week<ChevronDown size={14}/></button><Link href="/inbox" className="notification-button"><Bell size={19}/>{unread>0&&<span>{unread}</span>}</Link><button className="profile-button"><Avatar initials={initials(session.user.name)} tone="tone-rose"/><span className="profile-copy"><strong>{session.user.name}</strong><small>{workspace.role}</small></span><ChevronDown size={14}/></button></header><main className="page-content">{children}</main></div>
  </div>;
}
