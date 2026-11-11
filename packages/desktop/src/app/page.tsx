"use client";

import { useEffect, useState } from 'react';
import { Activity, Box, Search, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ tags: 0, triggers: 0, zones: 0, variables: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/project')
      .then(res => res.json())
      .then(data => {
        setStats({
          tags: data.tags?.length || 0,
          triggers: data.triggers?.length || 0,
          zones: data.zones?.length || 0,
          variables: data.variables?.length || 0,
        });
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Project Dashboard</h1>
          <p className="text-slate-400 mt-1">Real-time overview of your container.</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-10">
        <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Container Size</div>
          <div className="text-3xl font-bold text-slate-100">{loading ? '...' : '32.4 KB'}</div>
          <div className="text-sm mt-2 text-emerald-400 flex items-center gap-1">↓ 12% vs last week</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Active Tags</div>
          <div className="text-3xl font-bold text-slate-100">{loading ? '...' : stats.tags}</div>
          <div className="text-sm mt-2 text-slate-400">Managed in {stats.tags} files</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Audit Score</div>
          <div className="text-3xl font-bold text-slate-100">94/100</div>
          <div className="text-sm mt-2 text-emerald-400 flex items-center gap-1">↑ 4 pts after fix</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Assets</div>
          <div className="text-3xl font-bold text-slate-100">{loading ? '...' : stats.tags + stats.triggers + stats.variables}</div>
          <div className="text-sm mt-2 text-slate-400">Across {stats.zones} zones</div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-slate-100 mb-4">Recent Updates</h2>
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800/80">
            <tr>
              <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">FILE</th>
              <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">ACTION</th>
              <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">AUTHOR</th>
              <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">TIME</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            <tr className="hover:bg-slate-700/20 transition-colors">
              <td className="p-4"><code className="text-sky-400 text-sm">tags/meta-purchase.ts</code></td>
              <td className="p-4 text-slate-300">Update Zone</td>
              <td className="p-4 text-slate-400">david@yourtm.io</td>
              <td className="p-4 text-slate-400">12m ago</td>
            </tr>
            <tr className="hover:bg-slate-700/20 transition-colors">
              <td className="p-4"><code className="text-sky-400 text-sm">triggers/click-atc.ts</code></td>
              <td className="p-4 text-slate-300">New Trigger</td>
              <td className="p-4 text-slate-400">AI Optimizer</td>
              <td className="p-4 text-slate-400">1h ago</td>
            </tr>
            <tr className="hover:bg-slate-700/20 transition-colors">
              <td className="p-4"><code className="text-sky-400 text-sm">yourtm.config.ts</code></td>
              <td className="p-4 text-slate-300">Config Change</td>
              <td className="p-4 text-slate-400">david@yourtm.io</td>
              <td className="p-4 text-slate-400">Yesterday</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
