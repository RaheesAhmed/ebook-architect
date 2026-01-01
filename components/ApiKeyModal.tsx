import React, { useState, useEffect } from 'react';
import { X, Key, CheckCircle } from './Icons';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) setKey(storedKey);
  }, [isOpen]);

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem('gemini_api_key', key.trim());
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1000);
    } else {
        // Allow clearing the key
        localStorage.removeItem('gemini_api_key');
        setKey('');
        onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100 ring-1 ring-white/50">
        <div className="p-5 border-b border-surface-100 flex items-center justify-between bg-surface-50">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Key className="w-5 h-5 text-primary-600" />
            <span>API Configuration</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-500 leading-relaxed">
            To use the eBook Architect, you can provide your own Google Gemini API key. 
            It will be stored locally in your browser.
          </p>
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Enter Gemini API Key</label>
            <input 
              type="password" 
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full p-3.5 border border-surface-300 rounded-xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none font-mono text-sm transition-all"
            />
          </div>

          <div className="pt-2">
            <button 
              onClick={handleSave}
              className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${
                saved 
                  ? 'bg-green-500 text-white shadow-green-500/20' 
                  : 'bg-primary-600 text-white hover:bg-primary-700 shadow-primary-600/20'
              }`}
            >
              {saved ? (
                <>
                  <CheckCircle className="w-5 h-5" /> Saved!
                </>
              ) : (
                'Save API Key'
              )}
            </button>
          </div>
          
          <p className="text-xs text-center text-slate-400 pt-1">
            Get your key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-medium">Google AI Studio</a>
          </p>
        </div>
      </div>
    </div>
  );
};