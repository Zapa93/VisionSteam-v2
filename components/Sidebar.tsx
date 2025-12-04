import React from 'react';
import { Category } from '../types';

interface SidebarProps {
  activeCategory: Category;
  onSelectCategory: (category: Category) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeCategory, onSelectCategory }) => {
  return (
    <div className="w-64 h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col pt-10">
      <nav className="flex-1 px-4 space-y-4">
        {Object.values(Category).map((category) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              onClick={() => onSelectCategory(category)}
              className={`w-full group relative flex items-center px-4 py-4 rounded-xl transition-all duration-200 
                ${isActive 
                  ? 'bg-white/10' 
                  : 'hover:bg-white/5'
                }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-purple-500 rounded-r-full"></div>
              )}
              
              <div className={`mr-4 p-2 rounded-lg transition-colors ${isActive ? 'bg-purple-500 text-white' : 'bg-gray-800 text-gray-400'}`}>
                {category === Category.KANALER ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>

              <span className={`text-lg font-medium tracking-wide ${isActive ? 'text-white' : 'text-gray-400'}`}>
                {category}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};