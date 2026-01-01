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
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-brand-100 selection:text-brand-900 flex flex-col">
      <ApiKeyModal isOpen={isApiKeyModalOpen} onClose={() => setIsApiKeyModalOpen(false)} />

      {/* Hero Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 flex-none">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-brand-500/30">
              <Library className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">eBook Architect</span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-500">
             
             <button 
                onClick={() => setIsApiKeyModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-brand-50 text-slate-600 hover:text-brand-600 rounded-full transition-colors border border-slate-200"
             >
                <Key className="w-4 h-4" />
                <span>Add API Key</span>
             </button>

             {status !== GenerationStatus.IDLE && (
               <>
                <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
                <button onClick={reset} className="text-slate-400 hover:text-red-500 transition-colors">Reset</button>
               </>
             )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 md:py-12 flex flex-col">

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-700 animate-fade-in">
             <div className="mt-0.5"><Settings className="w-5 h-5" /></div>
             <div>
               <h3 className="font-bold">Something went wrong</h3>
               <p className="text-sm opacity-90">{error}</p>
               <div className="flex gap-4 mt-2">
                <button onClick={() => setStatus(GenerationStatus.IDLE)} className="text-xs font-bold uppercase tracking-wider hover:underline">Try Again</button>
                {error.includes("API Key") && (
                   <button onClick={() => setIsApiKeyModalOpen(true)} className="text-xs font-bold uppercase tracking-wider hover:underline">Add Key</button>
                )}
               </div>
             </div>
          </div>
        )}

        {/* STEP 1: CONFIGURATION */}
        {status === GenerationStatus.IDLE && (
          <div className="space-y-8 animate-fade-in w-full">
            <div className="text-center space-y-4 mb-12">
              <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight">
                Create engaging eBooks<br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600">visualized with AI.</span>
              </h1>
              <p className="text-lg text-slate-500 max-w-xl mx-auto">
                Enter a topic to generate a professional, illustrated book or carousel with custom diagrams.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">What is your book about?</label>
                <textarea 
                  value={config.topic}
                  onChange={(e) => handleConfigChange('topic', e.target.value)}
                  placeholder="e.g., How to Build a Neural Network from Scratch..."
                  className="w-full p-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 outline-none transition-all text-lg resize-none h-32"
                />
              </div>

              {/* Format Selection */}
              <div className="grid grid-cols-2 gap-4">
                 <button 
                   onClick={() => handleConfigChange('format', 'ebook')}
                   className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                     config.format === 'ebook' 
                      ? 'border-brand-500 bg-brand-50 text-brand-700' 
                      : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100'
                   }`}
                 >
                    <BookOpen className="w-6 h-6" />
                    <span className="font-bold">Standard eBook</span>
                 </button>
                 <button 
                   onClick={() => handleConfigChange('format', 'linkedin-carousel')}
                   className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                     config.format === 'linkedin-carousel' 
                      ? 'border-brand-500 bg-brand-50 text-brand-700' 
                      : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100'
                   }`}
                 >
                    <LayoutTemplate className="w-6 h-6" />
                    <span className="font-bold">LinkedIn Carousel</span>
                 </button>
              </div>

              {/* Author & Chapter Count */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Author Name</label>
                    <div className="relative">
                       <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                       <input 
                         type="text" 
                         value={config.authorName}
                         onChange={(e) => handleConfigChange('authorName', e.target.value)}
                         placeholder="e.g. John Doe"
                         className="w-full p-3 pl-10 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 outline-none"
                       />
                    </div>
                 </div>
                 <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                       {config.format === 'linkedin-carousel' ? 'Number of Slides' : 'Number of Chapters'}
                    </label>
                    <div className="flex items-center gap-4">
                       <input 
                          type="range"
                          min="3"
                          max="15"
                          step="1"
                          value={config.chapterCount}
                          onChange={(e) => handleConfigChange('chapterCount', parseInt(e.target.value))}
                          className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                       />
                       <span className="font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full min-w-[3rem] text-center">
                          {config.chapterCount}
                       </span>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-2">Target Audience</label>
                   <input 
                      type="text" 
                      value={config.audience}
                      onChange={(e) => handleConfigChange('audience', e.target.value)}
                      className="w-full p-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-brand-500 outline-none"
                   />
                </div>
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-2">Tone of Voice</label>
                   <select 
                      value={config.tone}
                      onChange={(e) => handleConfigChange('tone', e.target.value)}
                      className="w-full p-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:border-brand-500 outline-none"
                   >
                     <option>Informative & Engaging</option>
                     <option>Academic & Professional</option>
                     <option>Casual & Friendly</option>
                     <option>Inspirational & Motivational</option>
                     <option>Story-driven & Narrative</option>
                   </select>
                </div>
              </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                   <label className="block text-sm font-semibold text-slate-700 mb-2">Illustration Style</label>
                   <select 
                      value={config.style}
                      onChange={(e) => handleConfigChange('style', e.target.value)}
                      className="w-full p-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:border-brand-500 outline-none"
                   >
                     <option>Modern Minimalist</option>
                     <option>Watercolor Artistic</option>
                     <option>Photorealistic</option>
                     <option>Cyberpunk / Futuristic</option>
                     <option>Vintage / Classic</option>
                   </select>
                </div>
                <div className="flex items-center gap-3 pt-8">
                  <input 
                    type="checkbox" 
                    id="search"
                    checked={config.enableSearch}
                    onChange={(e) => handleConfigChange('enableSearch', e.target.checked)}
                    className="w-5 h-5 text-brand-600 rounded focus:ring-brand-500 border-gray-300"
                  />
                  <label htmlFor="search" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                    Enable Google Search Grounding <br/>
                    <span className="text-xs text-slate-400 font-normal">For factual, up-to-date content</span>
                  </label>
                </div>
              </div>

              <button 
                onClick={startOutlineGeneration}
                disabled={!config.topic.trim()}
                className="w-full py-4 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 text-lg shadow-lg shadow-brand-600/20"
              >
                <Sparkles className="w-5 h-5" /> Generate Outline
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: LOADING OUTLINE */}
        {status === GenerationStatus.GENERATING_OUTLINE && (
          <div className="flex flex-col items-center justify-center py-10 animate-fade-in text-center w-full">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Architecting your {config.format === 'ebook' ? 'book' : 'carousel'}...</h2>
            <OutlineSkeleton />
          </div>
        )}

        {/* STEP 3: REVIEW OUTLINE (EDITABLE) */}
        {status === GenerationStatus.REVIEWING_OUTLINE && bookData && (
           <div className="space-y-6 animate-fade-in w-full">
              <div className="flex items-center justify-between">
                <div>
                   <h2 className="text-2xl font-bold text-slate-800">Review Outline</h2>
                   <p className="text-slate-500">Edit your {bookData.config.format === 'ebook' ? 'chapters' : 'slides'} before generation.</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden p-2">
                 {/* Title Edit */}
                 <div className="p-4 border-b border-slate-100">
                    <label className="text-xs font-bold text-slate-400 uppercase">Title</label>
                    <input 
                      className="w-full text-2xl font-serif font-bold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-brand-500 focus:outline-none py-2 bg-transparent"
                      value={bookData.config.title}
                      onChange={(e) => setBookData({...bookData, config: {...bookData.config, title: e.target.value}})}
                    />
                 </div>

                <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
                  {bookData.outline.map((chapter, idx) => (
                    <div key={chapter.id} className="p-4 hover:bg-slate-50 transition-colors group relative">
                      <div className="flex items-start gap-4">
                        <div className="flex-none w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-serif font-bold text-sm mt-2">
                          {idx + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                          <input 
                            className="w-full font-bold text-slate-800 text-lg bg-transparent border border-transparent hover:border-slate-200 focus:border-brand-500 focus:bg-white rounded px-2 py-1 focus:outline-none"
                            value={chapter.title}
                            onChange={(e) => handleUpdateChapter(idx, 'title', e.target.value)}
                          />
                          <textarea 
                            className="w-full text-slate-500 text-sm bg-transparent border border-transparent hover:border-slate-200 focus:border-brand-500 focus:bg-white rounded px-2 py-1 focus:outline-none resize-none h-16"
                            value={chapter.description}
                            onChange={(e) => handleUpdateChapter(idx, 'description', e.target.value)}
                          />
                        </div>
                        <button 
                          onClick={() => handleRemoveChapter(idx)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 p-2"
                          title="Remove"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="p-4">
                     <button onClick={handleAddChapter} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 font-medium hover:border-brand-500 hover:text-brand-600 hover:bg-brand-50 transition-all flex items-center justify-center gap-2">
                        + Add {bookData.config.format === 'ebook' ? 'Chapter' : 'Slide'}
                     </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 sticky bottom-0 bg-slate-50 pb-4">
                <button 
                  onClick={startOutlineGeneration}
                  className="flex-1 py-3 px-6 bg-white border border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Regenerate
                </button>
                <button 
                  onClick={startFullGeneration}
                  className="flex-[2] py-3 px-6 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 shadow-lg shadow-brand-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <BookOpen className="w-5 h-5" /> Generate ({bookData.outline.length} Items)
                </button>
              </div>
           </div>
        )}

        {/* STEP 4: GENERATING BOOK */}
        {(status === GenerationStatus.GENERATING_BOOK || status === GenerationStatus.ERROR) && bookData && (
          <div className="space-y-8 animate-fade-in w-full max-w-2xl mx-auto">
             <div className="text-center">
               <h2 className="text-2xl font-bold text-slate-900 mb-2">
                 {status === GenerationStatus.ERROR ? 'Generation Paused' : 'Writing your Masterpiece'}
               </h2>
               <p className="text-slate-500">{generationProgress.message}</p>
               
               {/* Progress Bar */}
               <div className="mt-6 w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                 <div 
                   className="bg-brand-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                   style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                 ></div>
               </div>
               <div className="mt-2 text-xs text-slate-400 font-mono">
                 {Math.round((generationProgress.current / generationProgress.total) * 100)}% Complete
               </div>
             </div>

             <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col max-h-[500px]" ref={scrollRef}>
                {/* Cover Step */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                     <div className={`p-2 rounded-lg ${bookData.coverImage ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                        <ImageIcon className="w-5 h-5" />
                     </div>
                     <div>
                       <div className="font-semibold text-slate-800">Cover Design</div>
                       <div className="text-xs text-slate-500">Design & Illustration</div>
                     </div>
                   </div>
                   {bookData.coverImage ? (
                     <CheckCircle className="w-5 h-5 text-green-500" />
                   ) : (
                     <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                   )}
                </div>

                {/* Chapters Steps */}
                <div className="overflow-y-auto flex-1 p-4 space-y-3 bg-slate-50/50">
                  {bookData.outline.map((chapter, idx) => (
                    <div key={chapter.id} className={`p-3 rounded-lg border transition-all ${
                       chapter.status === 'completed' ? 'bg-white border-green-200 shadow-sm' : 
                       chapter.status === 'pending' ? 'bg-transparent border-transparent opacity-50' :
                       'bg-white border-brand-200 ring-2 ring-brand-100'
                    }`}>
                       <div className="flex flex-col gap-2">
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold w-6 h-6 rounded flex items-center justify-center ${
                                chapter.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'
                              }`}>{idx + 1}</span>
                              <span className="font-medium text-slate-800 text-sm">{chapter.title}</span>
                           </div>
                           <div className="flex items-center gap-2">
                              {/* Text Status */}
                              {chapter.status === 'generating_text' && <span className="text-xs text-brand-600 animate-pulse font-medium">Writing...</span>}
                              {chapter.content && <PenTool className="w-4 h-4 text-green-500" />}
                              
                              {/* Image Status */}
                              {chapter.status === 'generating_image' && <span className="text-xs text-purple-600 animate-pulse font-medium">Illustrating...</span>}
                              {chapter.imageUrl && <ImageIcon className="w-4 h-4 text-green-500" />}

                              {chapter.status === 'pending' && <span className="text-xs text-slate-400">Waiting...</span>}
                           </div>
                         </div>
                         {/* Live Stream Preview */}
                         {chapter.status === 'generating_text' && chapter.content && (
                           <div className="ml-9 text-xs text-slate-500 font-serif line-clamp-2 opacity-80 border-l-2 border-brand-200 pl-2">
                             {chapter.content}
                           </div>
                         )}
                       </div>
                    </div>
                  ))}
                </div>
             </div>
             
             {status === GenerationStatus.ERROR && (
                <button onClick={startFullGeneration} className="w-full py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-bold">
                  Resume Generation
                </button>
             )}
          </div>
        )}

      </main>
    </div>
  );
};

export default App;