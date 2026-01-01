import React from 'react';

export const OutlineSkeleton = () => (
  <div className="w-full max-w-2xl mx-auto space-y-6 animate-pulse">
    {/* Title Skeleton */}
    <div className="space-y-2 text-center mb-10">
      <div className="h-4 bg-slate-200 rounded w-1/4 mx-auto"></div>
      <div className="h-8 bg-slate-200 rounded w-3/4 mx-auto"></div>
    </div>

    {/* List Items Skeleton */}
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-5 flex items-start gap-4">
          <div className="w-8 h-8 bg-slate-200 rounded-full shrink-0"></div>
          <div className="flex-1 space-y-3 py-1">
            <div className="h-5 bg-slate-200 rounded w-1/3"></div>
            <div className="h-4 bg-slate-200 rounded w-5/6"></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const CoverSkeleton = () => (
  <div className="w-full aspect-[2/3] bg-slate-200 rounded-lg animate-pulse relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-tr from-slate-300 via-slate-200 to-slate-300 opacity-50"></div>
    <div className="absolute bottom-8 left-8 right-8 space-y-4">
      <div className="h-8 bg-slate-300 rounded w-3/4"></div>
      <div className="h-4 bg-slate-300 rounded w-1/2"></div>
    </div>
  </div>
);