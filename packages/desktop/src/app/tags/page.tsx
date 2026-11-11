"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TagDefinition } from '@yourtm/cli/dist/compiler/index';

export default function TagsPage() {
  const [tags, setTags] = useState<TagDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/project')
      .then(res => res.json())
      .then(data => {
        if (data.tags) {
          setTags(data.tags);
        }
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">Tags</h1>
          <p className="text-slate-400 mt-1">Define what tracking pixels and scripts fire.</p>
        </div>
        <button className="px-4 py-2 rounded-md font-semibold text-sm bg-sky-400 text-slate-950 hover:bg-sky-500 transition-colors">
          + New Tag
        </button>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-800/80">
            <tr>
              <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">NAME</th>
              <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">PLATFORM</th>
              <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">ZONES</th>
              <th className="p-4 text-xs font-semibold text-slate-400 border-b border-slate-700">STATUS</th>
              <th className="p-4 border-b border-slate-700"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">Loading tags...</td>
              </tr>
            ) : tags.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">No tags found.</td>
              </tr>
            ) : (
              tags.map(tag => (
                <Link key={tag.id} href={`/tags/${tag.id}`} legacyBehavior>
                  <tr className="hover:bg-slate-700/20 transition-colors cursor-pointer group">
                    <td className="p-4 font-semibold text-slate-200">{tag.name}</td>
                    <td className="p-4 text-slate-400">{tag.platform || 'Custom'}</td>
                    <td className="p-4">
                      <span className="bg-sky-400/10 text-sky-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-sky-400/20">
                        {(tag as any).zones?.[0] || 'Global'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="bg-emerald-400/10 text-emerald-400 px-2.5 py-0.5 rounded-full text-xs font-medium border border-emerald-400/20">
                        Live
                      </span>
                    </td>
                    <td className="p-4 text-right text-slate-500 group-hover:text-sky-400 transition-colors">
                      Edit →
                    </td>
                  </tr>
                </Link>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
