import Link from 'next/link';
import { LayoutDashboard, Tag, Zap, Database, Map, Bot, Rocket, Settings, Plus, Upload, Activity, Globe } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col py-6">
      <div className="px-6 pb-6 text-xl font-extrabold flex items-center gap-3 text-slate-100">
        <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-indigo-500 rounded-lg flex items-center justify-center text-white">
          Y
        </div>
        YourTM Desktop
      </div>

      {/* Create New Button */}
      <div className="px-4 pb-6">
        <Link
          href="/create"
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-semibold text-sm hover:from-sky-600 hover:to-indigo-600 transition-all shadow-lg shadow-sky-500/20"
        >
          <Plus size={18} /> Create New
        </Link>
      </div>

      <nav className="flex-1">
        <ul className="space-y-1">
          <li>
            <Link href="/" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <LayoutDashboard size={18} /> Dashboard
            </Link>
          </li>
          <li>
            <Link href="/tags" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Tag size={18} /> Tags
            </Link>
          </li>
          <li>
            <Link href="/triggers" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Zap size={18} /> Triggers
            </Link>
          </li>
          <li>
            <Link href="/variables" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Database size={18} /> Variables
            </Link>
          </li>
          <li>
            <Link href="/zones" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Map size={18} /> Zones
            </Link>
          </li>

          <li className="pt-6">
            <div className="px-6 pb-2 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Tools</div>
          </li>
          <li>
            <Link href="/preview" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Activity size={18} /> Preview Mode
            </Link>
          </li>
          <li>
            <Link href="/audit" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Bot size={18} /> AI Audit
            </Link>
          </li>
          <li>
            <Link href="/import" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Upload size={18} /> Import GTM
            </Link>
          </li>
          <li>
            <Link href="/deploy" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Rocket size={18} /> Deploy
            </Link>
          </li>
          <li>
            <Link href="/wordpress" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
              <Globe size={18} /> WordPress
            </Link>
          </li>
        </ul>
      </nav>

      {/* Settings at bottom */}
      <div className="border-t border-slate-800 pt-4 mt-4">
        <Link href="/settings" className="flex items-center gap-3 px-6 py-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors text-sm font-medium">
          <Settings size={18} /> Settings
        </Link>
      </div>

      <div className="px-6 py-4 text-xs text-slate-500">
        v1.2.4 "Arrakis" CLI Linked
      </div>
    </aside>
  );
}
