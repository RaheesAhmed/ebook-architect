import React, { useState, useEffect, useRef } from 'react';
import { BookConfig, BookData, Chapter, GenerationStatus, BookFormat } from './types';
import * as GeminiService from './services/geminiService';
import { 
  Sparkles, 
  BookOpen, 
  Settings, 
  ChevronRight, 
  Loader2, 
  CheckCircle,
  Library,
  PenTool,
  ImageIcon,
  RefreshCw,
  Key,
  User,
  LayoutTemplate
} from './components/Icons';
import BookReader from './components/BookReader';
import { OutlineSkeleton } from './components/Skeleton';
import { ApiKeyModal } from './components/ApiKeyModal';

const INITIAL_CONFIG: BookConfig = {
  topic: '',
  title: '',
  authorName: '',
  audience: 'General Reader',
  tone: 'Informative & Engaging',
  enableSearch: true,
  style: 'Modern Minimalist',
  chapterCount: 5,
  format: 'ebook'
};

const App: React.FC = () => {
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [config, setConfig] = useState<BookConfig>(INITIAL_CONFIG);
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  
  // Progress tracking
  const [generationProgress, setGenerationProgress] = useState<{current: number, total: number, message: string}>({
    current: 0, 
    total: 0,
    message: ''
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleConfigChange = (key: keyof BookConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const startOutlineGeneration = async () => {
    if (!config.topic) return;
    setStatus(GenerationStatus.GENERATING_OUTLINE);
    setError(null);
    try {
      const outlineData = await GeminiService.generateBookOutline(config);
      
      if (!outlineData.chapters) {
          throw new Error("Invalid response format: Chapters missing");
      }

      const chapters: Chapter[] = outlineData.chapters.map((c, i) => ({
        id: `chap-${i}`,
        ...c,
        status: 'pending'
      }));

      // If AI didn't provide a title, use the one from config or fallback
      const finalTitle = outlineData.title || config.title || config.topic;

      setBookData({
        config: { ...config, title: finalTitle },
        outline: chapters,
        generatedAt: new Date()
      });
      setStatus(GenerationStatus.REVIEWING_OUTLINE);
    } catch (e: any) {
      setError(e.message || "Failed to generate outline.");
      setStatus(GenerationStatus.IDLE);
      if (e.message.includes("API Key")) {
        setIsApiKeyModalOpen(true);
      }
    }
  };

  const handleUpdateChapter = (index: number, field: 'title' | 'description', value: string) => {
    if (!bookData) return;
    const newOutline = [...bookData.outline];
    newOutline[index] = { ...newOutline[index], [field]: value };
    setBookData({ ...bookData, outline: newOutline });
  };

  const handleAddChapter = () => {
    if (!bookData) return;
    const newChapter: Chapter = {
      id: `chap-${bookData.outline.length}-${Date.now()}`,
      title: 'New Chapter',
      description: 'Description of the new chapter',
      status: 'pending'
    };
    setBookData({ ...bookData, outline: [...bookData.outline, newChapter] });
  };

  const handleRemoveChapter = (index: number) => {
    if (!bookData) return;
    const newOutline = bookData.outline.filter((_, i) => i !== index);
    setBookData({ ...bookData, outline: newOutline });
  };

  const handleUpdateBookContent = (chapterId: string, newContent: string) => {
    if (!bookData) return;
    const newOutline = bookData.outline.map(c => 
      c.id === chapterId ? { ...c, content: newContent } : c
    );
    setBookData({ ...bookData, outline: newOutline });
  };

  const handleUpdateBookImage = (chapterId: string, newImageUrl: string) => {
     if (!bookData) return;
     const newOutline = bookData.outline.map(c => 
       c.id === chapterId ? { ...c, imageUrl: newImageUrl } : c
     );
     setBookData({ ...bookData, outline: newOutline });
  };


  const startFullGeneration = async () => {
    if (!bookData) return;
    setStatus(GenerationStatus.GENERATING_BOOK);
    
    // Total steps: Cover + (Chapters * 2 [Text + Image])
    const totalSteps = 1 + (bookData.outline.length * 2);
    let completedSteps = 0;

    const updateProgress = (msg: string) => {
      setGenerationProgress({
        current: completedSteps,
        total: totalSteps,
        message: msg
      });
    };

    try {
      // 1. Generate Cover
      if (!bookData.coverImage) {
        updateProgress("Designing book cover...");
        try {
          const coverUrl = await GeminiService.generateBookCover(bookData.config.title, bookData.config.style, bookData.config.format);
          setBookData(prev => prev ? ({ ...prev, coverImage: coverUrl }) : null);
        } catch (e) {
          console.error("Cover generation failed", e);
        }
      }
      completedSteps++;

      // 2. Generate Chapters sequentially
      const newOutline = [...bookData.outline];
      
      for (let i = 0; i < newOutline.length; i++) {
        const chapter = newOutline[i];
        
        // Skip completed chapters if resuming
        if (chapter.status === 'completed' && chapter.content && chapter.imageUrl) {
          completedSteps += 2;
          continue;
        }

        // Update status to generating text
        newOutline[i] = { ...chapter, status: 'generating_text' };
        setBookData(prev => prev ? ({ ...prev, outline: [...newOutline] }) : null);
        
        // Scroll to keep progress in view
        if(scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }

        updateProgress(`Writing Chapter ${i + 1}: ${chapter.title}...`);
        
        const prevContext = i > 0 ? newOutline[i-1].description : undefined; 

        // STREAMING TEXT GENERATION
        let fullText = "";
        try {
          const stream = GeminiService.generateChapterContentStream(
            chapter, 
            bookData.config.title, 
            bookData.config,
            prevContext
          );

          for await (const chunk of stream) {
            fullText += chunk;
            newOutline[i] = { ...newOutline[i], content: fullText };
            setBookData(prev => prev ? ({ ...prev, outline: [...newOutline] }) : null);
          }
        } catch (streamError) {
          console.error("Stream error", streamError);
          fullText = fullText || "*Error generating text. Please try regenerating.*";
        }

        newOutline[i] = { ...newOutline[i], status: 'generating_image', content: fullText };
        setBookData(prev => prev ? ({ ...prev, outline: [...newOutline] }) : null);
        completedSteps++;
        updateProgress(`Illustrating Chapter ${i + 1}...`);

        try {
          const imageUrl = await GeminiService.generateChapterIllustration(chapter.title, bookData.config.style, bookData.config.format);
          newOutline[i] = { ...newOutline[i], imageUrl, status: 'completed' };
        } catch (e) {
           console.error(`Image for chap ${i} failed`, e);
           newOutline[i] = { ...newOutline[i], status: 'completed' };
        }
        
        setBookData(prev => prev ? ({ ...prev, outline: [...newOutline] }) : null);
        completedSteps++;
      }

      setStatus(GenerationStatus.COMPLETED);
    } catch (e: any) {
      setError(e.message || "Generation failed midway.");
      setStatus(GenerationStatus.ERROR);
      if (e.message.includes("API Key")) {
        setIsApiKeyModalOpen(true);
      }
    }
  };

  const reset = () => {
    setStatus(GenerationStatus.IDLE);
    setBookData(null);
    setConfig(INITIAL_CONFIG);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (status === GenerationStatus.COMPLETED && bookData) {
    return (
      <BookReader 
        book={bookData} 
        onBack={() => setStatus(GenerationStatus.REVIEWING_OUTLINE)}
        onUpdateContent={handleUpdateBookContent}
        onUpdateImage={handleUpdateBookImage}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-100 selection:text-primary-900 flex flex-col">
      <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} />

      {/* Modern Header */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${status === GenerationStatus.IDLE ? 'bg-transparent py-6' : 'bg-white/80 backdrop-blur-md border-b border-surface-200 py-4'}`}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
            <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-500/20">
              <Library className="w-6 h-6" />
            </div>
            {(status !== GenerationStatus.IDLE) && (
               <span className="font-display font-bold text-xl text-slate-900 tracking-tight animate-fade-in">eBook Architect</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm font-medium">
             <button 
                onClick={() => setIsApiKeyModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-white text-slate-600 hover:text-primary-600 rounded-full transition-all border border-transparent hover:border-surface-200 hover:shadow-sm"
             >
                <Key className="w-4 h-4" />
                <span>API Key</span>
             </button>
             {status !== GenerationStatus.IDLE && (
               <button onClick={reset} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                 <RefreshCw className="w-4 h-4" />
               </button>
             )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex flex-col relative z-10 pt-20">
        
        {/* ERROR TOAST */}
        {error && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
            <div className="bg-white border border-red-100 rounded-2xl shadow-xl shadow-red-500/5 p-4 flex items-center gap-4 pr-6">
                <div className="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center flex-none">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Action Needed</h3>
                  <p className="text-sm text-slate-500">{error}</p>
                </div>
                <div className="h-8 w-px bg-slate-100 mx-2"></div>
                {error.includes("API Key") ? (
                   <button onClick={() => setIsApiKeyModalOpen(true)} className="text-xs font-bold text-primary-600 hover:text-primary-700 uppercase tracking-wider">Add Key</button>
                ) : (
                   <button onClick={() => setStatus(GenerationStatus.IDLE)} className="text-xs font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider">Dismiss</button>
                )}
            </div>
          </div>
        )}

        {/* STEP 1: HERO & CONFIGURATION */}
        {status === GenerationStatus.IDLE && (
          <div className="max-w-4xl mx-auto w-full px-4 pb-20 animate-fade-in">
            {/* Dynamic Hero */}
            <div className="text-center py-10 lg:py-16 space-y-4">
              <h1 className="text-4xl lg:text-6xl font-display font-extrabold text-slate-900 tracking-tighter leading-tight animate-slide-up" style={{animationDelay: '0.1s'}}>
                Turn ideas into <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 via-purple-500 to-primary-600 bg-300% animate-shimmer">
                  Visual Masterpieces.
                </span>
              </h1>
              <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed animate-slide-up" style={{animationDelay: '0.2s'}}>
                Create professional, illustrated eBooks and LinkedIn carousels in seconds.
                Just type a topic, and we'll handle the rest.
              </p>
            </div>

            {/* "Search" Input Card */}
            <div className="bg-white rounded-3xl shadow-xl shadow-surface-200/50 border border-surface-200 p-2 animate-slide-up" style={{animationDelay: '0.3s'}}>
              <div className="relative group">
                <div className="absolute top-0 left-0 bottom-0 w-14 flex items-center justify-center text-slate-400 group-focus-within:text-primary-500 transition-colors">
                  <LayoutTemplate className="w-5 h-5" />
                </div>
                <input 
                   type="text"
                   value={config.topic}
                   onChange={(e) => handleConfigChange('topic', e.target.value)}
                   placeholder="What do you want to write about?"
                   className="w-full h-14 pl-14 pr-6 rounded-2xl bg-surface-50 hover:bg-white focus:bg-white text-lg font-medium text-slate-900 placeholder:text-slate-400 outline-none border-2 border-transparent focus:border-primary-100 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.1)] transition-all"
                   autoFocus
                />
              </div>

              {/* Advanced Config Section */}
              <div className={`transition-all duration-500 overflow-hidden ${config.topic ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-50'}`}>
                <div className="p-6 md:p-8 space-y-8">
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-surface-200 to-transparent"></div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     
                     {/* Format Selection - Surface Cards */}
                     <div className="space-y-4">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Format</label>
                        <div className="flex gap-4">
                          <button 
                             onClick={() => handleConfigChange('format', 'ebook')}
                             className={`flex-1 p-4 rounded-2xl border transition-all duration-200 text-left relative overflow-hidden group ${
                               config.format === 'ebook' 
                               ? 'bg-primary-50 border-primary-200 text-primary-900' 
                               : 'bg-white border-surface-200 hover:border-primary-200 hover:shadow-lg'
                             }`}
                          >
                             <div className={`absolute top-4 right-4 w-4 h-4 rounded-full border-2 flex items-center justify-center ${config.format === 'ebook' ? 'border-primary-500' : 'border-slate-300'}`}>
                                {config.format === 'ebook' && <div className="w-2 h-2 bg-primary-500 rounded-full" />}
                             </div>
                             <BookOpen className={`w-8 h-8 mb-3 ${config.format === 'ebook' ? 'text-primary-600' : 'text-slate-400 group-hover:text-primary-500'}`} />
                             <div className="font-bold">E-Book</div>
                             <div className="text-xs opacity-70 mt-1">PDF Download</div>
                          </button>
                          
                           <button 
                             onClick={() => handleConfigChange('format', 'linkedin-carousel')}
                             className={`flex-1 p-4 rounded-2xl border transition-all duration-200 text-left relative overflow-hidden group ${
                               config.format === 'linkedin-carousel' 
                               ? 'bg-primary-50 border-primary-200 text-primary-900' 
                               : 'bg-white border-surface-200 hover:border-primary-200 hover:shadow-lg'
                             }`}
                          >
                             <div className={`absolute top-4 right-4 w-4 h-4 rounded-full border-2 flex items-center justify-center ${config.format === 'linkedin-carousel' ? 'border-primary-500' : 'border-slate-300'}`}>
                                {config.format === 'linkedin-carousel' && <div className="w-2 h-2 bg-primary-500 rounded-full" />}
                             </div>
                             <LayoutTemplate className={`w-8 h-8 mb-3 ${config.format === 'linkedin-carousel' ? 'text-primary-600' : 'text-slate-400 group-hover:text-primary-500'}`} />
                             <div className="font-bold">Carousel</div>
                             <div className="text-xs opacity-70 mt-1">LinkedIn PDF</div>
                          </button>
                        </div>
                     </div>

                     {/* Length Slider - Google Style */}
                     <div className="space-y-4">
                        <div className="flex justify-between items-baseline">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                            {config.format === 'linkedin-carousel' ? 'Slides' : 'Chapters'}
                          </label>
                          <span className="font-mono text-xl font-bold text-primary-600">{config.chapterCount}</span>
                        </div>
                        <div className="h-16 bg-surface-50 rounded-2xl border border-surface-200 flex items-center px-6 relative">
                           <input 
                              type="range"
                              min="3"
                              max="15"
                              step="1"
                              value={config.chapterCount}
                              onChange={(e) => handleConfigChange('chapterCount', parseInt(e.target.value))}
                              className="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-primary-600 focus:outline-none focus:ring-0"
                           />
                           {/* Markings */}
                           <div className="absolute bottom-3 left-6 text-[10px] text-slate-400 font-medium">Short</div>
                           <div className="absolute bottom-3 right-6 text-[10px] text-slate-400 font-medium">Detailed</div>
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Smart Inputs */}
                     <div className="space-y-4">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Author</label>
                        <div className="relative group">
                           <User className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" />
                           <input 
                             type="text" 
                             value={config.authorName}
                             onChange={(e) => handleConfigChange('authorName', e.target.value)}
                             placeholder="Your Name"
                             className="w-full p-3 pl-12 rounded-xl border border-surface-200 bg-surface-50 focus:bg-white text-slate-900 outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10"
                           />
                        </div>
                     </div>

                     <div className="space-y-4">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Style</label>
                        <div className="relative">
                          <select 
                              value={config.style}
                              onChange={(e) => handleConfigChange('style', e.target.value)}
                              className="w-full p-3 pl-4 pr-10 appearance-none rounded-xl border border-surface-200 bg-surface-50 focus:bg-white text-slate-900 outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10"
                          >
                            <option>Modern Minimalist</option>
                            <option>Watercolor Artistic</option>
                            <option>Photorealistic</option>
                            <option>Cyberpunk / Futuristic</option>
                            <option>Vintage / Classic</option>
                          </select>
                          <ChevronRight className="absolute right-4 top-3.5 w-5 h-5 text-slate-400 rotate-90 pointer-events-none" />
                        </div>
                     </div>
                  </div>

                  {/* Grounding Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-surface-50 border border-surface-200">
                     <div className="flex gap-3">
                       <div className="mt-1">
                          <CheckCircle className={`w-5 h-5 ${config.enableSearch ? 'text-primary-600' : 'text-slate-300'}`} />
                       </div>
                       <div>
                         <h4 className="font-bold text-slate-700 text-sm">Google Grounding</h4>
                         <p className="text-xs text-slate-500">Enrich content with live search data</p>
                       </div>
                     </div>
                     <button
                        onClick={() => handleConfigChange('enableSearch', !config.enableSearch)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${config.enableSearch ? 'bg-primary-600' : 'bg-slate-300'}`}
                     >
                       <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${config.enableSearch ? 'left-[calc(100%-1.25rem)]' : 'left-1'}`} />
                     </button>
                  </div>
                  
                  {/* Primary Action */}
                  <div className="pt-4">
                    <button 
                      onClick={startOutlineGeneration}
                      disabled={!config.topic.trim()}
                      className="w-full py-5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all transform active:scale-[0.99] flex items-center justify-center gap-3 text-lg shadow-xl shadow-primary-600/30 hover:shadow-primary-600/40"
                    >
                      <Sparkles className="w-5 h-5 animate-pulse-slow" /> 
                      <span>Generate Outline</span>
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: SKELETON LOADING */}
        {status === GenerationStatus.GENERATING_OUTLINE && (
          <div className="flex flex-col items-center justify-center py-20 px-6 animate-fade-in w-full max-w-4xl mx-auto text-center">
            <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mb-8 relative">
               <div className="absolute inset-0 border-4 border-primary-500/30 rounded-full animate-ping"></div>
               <Sparkles className="w-8 h-8 text-primary-600 animate-pulse" />
            </div>
            <h2 className="text-3xl font-display font-bold text-slate-800 mb-2">Architecting your {config.format === 'ebook' ? 'book' : 'carousel'}...</h2>
            <p className="text-slate-500 mb-12">Analysis • Structuring • Planning</p>
            <div className="w-full max-w-lg bg-white p-8 rounded-2xl shadow-lg border border-surface-100">
               <OutlineSkeleton />
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW OUTLINE */}
        {status === GenerationStatus.REVIEWING_OUTLINE && bookData && (
           <div className="max-w-4xl mx-auto px-6 pb-20 animate-slide-up">
              <div className="flex items-center justify-between mb-8">
                <div>
                   <h2 className="text-3xl font-display font-bold text-slate-800">Review Outline</h2>
                   <p className="text-slate-500">Customize your structure before we write.</p>
                </div>
              </div>

              <div className="bg-white rounded-[1.5rem] shadow-xl shadow-surface-200/50 border border-surface-200 overflow-hidden">
                 {/* Title Edit - Banner Style */}
                 <div className="p-8 bg-gradient-to-br from-surface-50 to-white border-b border-surface-100">
                    <label className="text-xs font-bold text-primary-600 uppercase tracking-widest mb-2 block">Project Title</label>
                    <input 
                      className="w-full text-3xl md:text-4xl font-display font-bold text-slate-900 bg-transparent border-none p-0 focus:ring-0 placeholder:text-slate-300"
                      value={bookData.config.title}
                      placeholder="Enter a catchy title..."
                      onChange={(e) => setBookData({...bookData, config: {...bookData.config, title: e.target.value}})}
                    />
                 </div>

                <div className="divide-y divide-surface-100 max-h-[60vh] overflow-y-auto custom-scrollbar">
                  {bookData.outline.map((chapter, idx) => (
                    <div key={chapter.id} className="p-6 hover:bg-surface-50 transition-colors group relative flex gap-6">
                      <div className="flex-none">
                        <div className="w-8 h-8 rounded-lg bg-surface-100 text-slate-500 flex items-center justify-center font-bold text-sm border border-surface-200 group-hover:bg-white group-hover:shadow-sm transition-all">
                          {idx + 1}
                        </div>
                      </div>
                      <div className="flex-1 space-y-3">
                        <input 
                          className="w-full font-bold text-slate-800 text-lg bg-transparent border-none p-0 focus:ring-0 hover:text-primary-700 transition-colors"
                          value={chapter.title}
                          onChange={(e) => handleUpdateChapter(idx, 'title', e.target.value)}
                        />
                        <textarea 
                          className="w-full text-slate-500 text-sm bg-transparent border-none p-0 focus:ring-0 resize-none h-12 leading-relaxed"
                          value={chapter.description}
                          onChange={(e) => handleUpdateChapter(idx, 'description', e.target.value)}
                        />
                      </div>
                      <button 
                        onClick={() => handleRemoveChapter(idx)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-2 transition-all self-start"
                        title="Remove"
                      >
                        <span className="text-xl">&times;</span>
                      </button>
                    </div>
                  ))}
                  <div className="p-6 bg-surface-50/50">
                     <button onClick={handleAddChapter} className="w-full py-4 border-2 border-dashed border-primary-200/50 rounded-xl text-primary-600 font-semibold hover:border-primary-500 hover:bg-primary-50 transition-all flex items-center justify-center gap-2">
                        <span className="text-lg">+</span> Add {bookData.config.format === 'ebook' ? 'Chapter' : 'Slide'}
                     </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-8 sticky bottom-6 z-30">
                <button 
                  onClick={startOutlineGeneration}
                  className="px-8 py-4 bg-white border border-surface-200 text-slate-700 font-bold rounded-2xl hover:bg-surface-50 transition-colors shadow-sm"
                >
                  Back
                </button>
                <button 
                  onClick={startFullGeneration}
                  className="flex-1 py-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-2xl transition-all shadow-xl shadow-primary-600/20 flex items-center justify-center gap-3 active:scale-[0.99]"
                >
                   <Sparkles className="w-5 h-5" />
                   <span>Start Generation ({bookData.outline.length} Items)</span>
                </button>
              </div>
           </div>
        )}

        {/* STEP 4: GENERATION PROGRESS */}
        {(status === GenerationStatus.GENERATING_BOOK || status === GenerationStatus.ERROR) && bookData && (
          <div className="max-w-3xl mx-auto px-6 pb-20 w-full animate-fade-in">
             <div className="text-center mb-12">
               <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-lg shadow-primary-500/10 mb-6">
                 {status === GenerationStatus.ERROR ? (
                   <div className="text-red-500">⚠️</div>
                 ) : (
                   <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                 )}
               </div>
               <h2 className="text-4xl font-display font-bold text-slate-900 mb-3">
                 {status === GenerationStatus.ERROR ? 'Generation Paused' : 'Crafting your content'}
               </h2>
               <p className="text-lg text-slate-500 font-medium">{generationProgress.message}</p>
             </div>

             {/* Modern Progress Bar */}
             <div className="w-full bg-surface-100 rounded-full h-1.5 overflow-hidden mb-12">
                 <div 
                   className="bg-gradient-to-r from-primary-500 to-indigo-500 h-full rounded-full transition-all duration-700 ease-out relative"
                   style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                 >
                   <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-white/30 to-transparent"></div>
                 </div>
             </div>

             <div className="bg-white rounded-3xl shadow-xl shadow-surface-200/50 border border-surface-200 overflow-hidden flex flex-col max-h-[600px]" ref={scrollRef}>
                {/* Cover Step */}
                <div className="p-6 border-b border-surface-100 flex items-center justify-between hover:bg-surface-50 transition-colors">
                   <div className="flex items-center gap-4">
                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bookData.coverImage ? 'bg-green-100 text-green-600' : 'bg-surface-100 text-slate-400'}`}>
                        <ImageIcon className="w-6 h-6" />
                     </div>
                     <div>
                       <h4 className="font-bold text-slate-800">Cover Design</h4>
                       <p className="text-sm text-slate-500">Visual identity and branding</p>
                     </div>
                   </div>
                   {bookData.coverImage && <CheckCircle className="w-6 h-6 text-green-500 animate-scale-in" />}
                </div>

                {/* Chapters Stream */}
                <div className="overflow-y-auto flex-1 p-6 space-y-4 bg-surface-50/30">
                  {bookData.outline.map((chapter, idx) => (
                    <div key={chapter.id} className={`p-4 rounded-2xl border transition-all duration-500 ${
                       chapter.status === 'completed' ? 'bg-white border-green-200/50 shadow-sm' : 
                       chapter.status === 'pending' ? 'bg-transparent border-transparent opacity-40' :
                       'bg-white border-primary-200 shadow-lg shadow-primary-500/5 scale-[1.02]'
                    }`}>
                       <div className="flex flex-col gap-3">
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-4">
                              <span className={`text-xs font-bold w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                chapter.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                chapter.status === 'pending' ? 'bg-surface-200 text-slate-500' :
                                'bg-primary-100 text-primary-700'
                              }`}>{idx + 1}</span>
                              <span className="font-bold text-slate-700">{chapter.title}</span>
                           </div>
                           
                           {/* Step Status Badges */}
                           <div className="flex items-center gap-2">
                              {(chapter.status === 'generating_text' || chapter.content) && (
                                <div className={`px-2 py-1 rounded-md flex items-center gap-1.5 ${chapter.content ? 'bg-green-50 text-green-600' : 'bg-primary-50 text-primary-600'}`}>
                                   <PenTool className="w-3 h-3" />
                                   {chapter.status === 'generating_text' && <span className="text-[10px] font-bold uppercase tracking-wider animate-pulse">Writing</span>}
                                </div>
                              )}
                              {(chapter.status === 'generating_image' || chapter.imageUrl) && (
                                <div className={`px-2 py-1 rounded-md flex items-center gap-1.5 ${chapter.imageUrl ? 'bg-green-50 text-green-600' : 'bg-purple-50 text-purple-600'}`}>
                                   <ImageIcon className="w-3 h-3" />
                                   {chapter.status === 'generating_image' && <span className="text-[10px] font-bold uppercase tracking-wider animate-pulse">Art</span>}
                                </div>
                              )}
                           </div>
                         </div>
                         
                         {/* Live Typing Preview */}
                         {chapter.status === 'generating_text' && chapter.content && (
                           <div className="ml-12 p-3 bg-surface-50 rounded-xl text-xs text-slate-600 font-serif leading-relaxed opacity-90 border border-surface-200">
                             <div className="line-clamp-2">{chapter.content}</div>
                           </div>
                         )}
                       </div>
                    </div>
                  ))}
                </div>
             </div>
             
             {status === GenerationStatus.ERROR && (
                <div className="mt-8 flex justify-center">
                   <button onClick={startFullGeneration} className="px-8 py-4 bg-slate-900 text-white rounded-2xl hover:bg-black font-bold shadow-lg flex items-center gap-2">
                     <RefreshCw className="w-4 h-4" /> Resume Generation
                   </button>
                </div>
             )}
          </div>
        )}

      </main>
    </div>
  );
};

export default App;