import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { BookData, Chapter } from '../types';
import { ChevronLeft, ChevronRight, Download, BookOpen, PenTool, CheckCircle, RefreshCw, Loader2, ImageIcon, Printer, ZoomIn, ZoomOut, Move } from './Icons';
import * as GeminiService from '../services/geminiService';

interface BookReaderProps {
  book: BookData;
  onBack: () => void;
  onUpdateContent: (id: string, content: string) => void;
  onUpdateImage: (id: string, url: string) => void;
}

// Interactive SVG Renderer
const InteractiveSvg = ({ content }: { content: string }) => {
  const [svgCode, setSvgCode] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Look for ```svg ... ``` blocks
    const match = content.match(/```svg([\s\S]*?)```/);
    if (match && match[1]) {
      setSvgCode(match[1].trim());
    } else {
        const svgMatch = content.match(/<svg([\s\S]*?)<\/svg>/);
        if (svgMatch) {
            setSvgCode(svgMatch[0]);
        }
    }
  }, [content]);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
       e.preventDefault();
       const delta = e.deltaY > 0 ? 0.9 : 1.1;
       setScale(s => Math.min(Math.max(0.5, s * delta), 4));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  if (!svgCode) return null;

  return (
    <div className="my-16 print-break-inside-avoid w-full">
      <div className="relative">
          <div className="absolute -top-3 left-4 bg-white px-2 text-xs font-bold text-slate-400 uppercase tracking-widest border border-slate-200 rounded-full z-10 shadow-sm">
            Figure
          </div>
          <div className="bg-surface-50/50 rounded-xl border border-surface-200 shadow-sm overflow-hidden relative group">
            {/* Toolbar */}
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur border border-slate-200 rounded-lg p-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                <button onClick={() => setScale(s => Math.min(s + 0.2, 4))} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Zoom In">
                <ZoomIn className="w-4 h-4" />
                </button>
                <button onClick={() => setScale(s => Math.max(s - 0.2, 0.5))} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Zoom Out">
                <ZoomOut className="w-4 h-4" />
                </button>
                <button onClick={resetView} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="Reset">
                <RefreshCw className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-200 mx-1"></div>
                <div className="flex items-center gap-1 px-2 text-xs text-slate-400 font-mono">
                <Move className="w-3 h-3" /> Drag
                </div>
            </div>

            <div 
                ref={containerRef}
                className={`w-full h-[450px] flex items-center justify-center cursor-grab active:cursor-grabbing bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <div 
                style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}
                dangerouslySetInnerHTML={{ __html: svgCode }} 
                className="[&>svg]:w-[90%] [&>svg]:h-auto [&>svg]:max-w-3xl [&>svg]:drop-shadow-xl select-none" 
                />
            </div>
        </div>
      </div>
    </div>
  );
};

const BookReader: React.FC<BookReaderProps> = ({ book, onBack, onUpdateContent, onUpdateImage }) => {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(-1); // -1 is Cover
  const [isEditing, setIsEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState("");
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Ref for the hidden print container
  const printContainerRef = useRef<HTMLDivElement>(null);

  const currentChapter = currentChapterIndex >= 0 ? book.outline[currentChapterIndex] : null;

  useEffect(() => {
    if (currentChapter) {
        setEditBuffer(currentChapter.content || "");
    }
    setIsEditing(false);
  }, [currentChapterIndex, currentChapter]);

  const handleNext = () => {
    if (currentChapterIndex < book.outline.length - 1) {
      setCurrentChapterIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentChapterIndex > -1) {
      setCurrentChapterIndex(prev => prev - 1);
    }
  };

  const handleSaveEdit = () => {
      if (currentChapter) {
          onUpdateContent(currentChapter.id, editBuffer);
          setIsEditing(false);
      }
  };

  const handleRegenerateImage = async () => {
      if (!currentChapter) return;
      setRegeneratingImage(true);
      try {
          const newUrl = await GeminiService.generateChapterIllustration(currentChapter.title, book.config.style, book.config.format);
          onUpdateImage(currentChapter.id, newUrl);
      } catch (e) {
          console.error("Failed to regenerate image", e);
      } finally {
          setRegeneratingImage(false);
      }
  };

  const handleDownloadPdf = async () => {
      if (!printContainerRef.current) return;
      setIsGeneratingPdf(true);

      // Wait a tick for render
      await new Promise(resolve => setTimeout(resolve, 500));

      try {
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const margin = 10;
          const contentWidth = pdfWidth - (margin * 2);

          const container = printContainerRef.current;
          const sections = Array.from(container.children) as HTMLElement[];

          for (let i = 0; i < sections.length; i++) {
              if (i > 0) pdf.addPage();
              
              const section = sections[i];
              // Use html2canvas to capture the section
              // Scale 2 for better quality (Retina)
              const canvas = await html2canvas(section, {
                  scale: 2,
                  useCORS: true,
                  logging: false,
                  backgroundColor: '#ffffff'
              });

              const imgData = canvas.toDataURL('image/jpeg', 0.95);
              const imgProps = pdf.getImageProperties(imgData);
              const imgHeight = (imgProps.height * contentWidth) / imgProps.width;

              // If image is taller than page, we might need to split it or scale it to fit if it's a cover
              // Simple strategy: If it's a cover (index 0), fit to page. Else, add as image.
              // For long chapters, html2canvas will create one long image. We need to slice it in PDF.
              
              if (imgHeight <= pdfHeight) {
                   pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, imgHeight);
              } else {
                  // Multi-page split logic for long chapters
                  let heightLeft = imgHeight;
                  let position = 0;
                  let pageAdded = false;

                  while (heightLeft > 0) {
                      if (pageAdded) pdf.addPage();
                      pdf.addImage(imgData, 'JPEG', margin, margin + position, contentWidth, imgHeight);
                      heightLeft -= (pdfHeight - (margin*2));
                      position -= (pdfHeight - (margin*2));
                      pageAdded = true;
                  }
              }
          }

          pdf.save(`${book.config.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);

      } catch (e) {
          console.error("PDF generation failed", e);
          alert("Failed to generate PDF. Please try again.");
      } finally {
          setIsGeneratingPdf(false);
      }
  };

  // Remove SVG blocks from markdown display to avoid duplication
  const displayContent = currentChapter ? currentChapter.content?.replace(/```svg[\s\S]*?```/g, "") : "";

  return (
    <div className="flex flex-col h-screen w-full bg-slate-100 overflow-hidden fixed inset-0 font-sans">
      {/* Toolbar */}
      <header className="flex-none bg-white border-b border-surface-200 px-4 md:px-6 py-3 flex items-center justify-between shadow-sm z-30 no-print">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-wide">
            <ChevronLeft className="w-4 h-4" /> Exit Reader
          </button>
          <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
          <h1 className="text-sm font-semibold text-slate-800 truncate max-w-[200px] md:max-w-md hidden md:block">
            {book.config.title} <span className="text-slate-400 font-normal">by {book.config.authorName || 'AI'}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
           <button 
             onClick={handleDownloadPdf}
             disabled={isGeneratingPdf}
             className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50"
           >
             {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
             {isGeneratingPdf ? 'Exporting...' : 'Download PDF'}
           </button>
           
           <div className="h-4 w-px bg-slate-200 mx-1"></div>

           {currentChapter && (
               <>
                <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`p-2 rounded-lg transition-colors ${isEditing ? 'bg-primary-100 text-primary-700' : 'text-slate-400 hover:text-primary-600 hover:bg-surface-50'}`}
                    title="Edit Text"
                >
                    <PenTool className="w-4 h-4" />
                </button>
               </>
           )}
           <span className="text-xs font-mono text-slate-400 bg-surface-50 border border-surface-200 px-2 py-1 rounded hidden md:block">
             {currentChapterIndex === -1 ? 'COVER' : `${currentChapterIndex + 1}/${book.outline.length}`}
           </span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex relative w-full">
        {/* Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-surface-200 h-full overflow-y-auto z-10 shrink-0 no-print">
          <div className="p-5 border-b border-surface-100 bg-surface-50/50">
             <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Table of Contents</div>
          </div>
          <nav className="p-3 space-y-1">
            <button 
              onClick={() => setCurrentChapterIndex(-1)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all flex items-center gap-3
                ${currentChapterIndex === -1 ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-surface-50'}`}
            >
              <BookOpen className={`w-4 h-4 ${currentChapterIndex === -1 ? 'text-primary-300' : 'text-slate-400'}`} />
              <span className="font-medium">Cover</span>
            </button>
            <div className="pt-2 pb-1 px-4 text-[10px] font-bold text-slate-300 uppercase tracking-widest">Chapters</div>
            {book.outline.map((chapter, idx) => (
              <button
                key={chapter.id}
                onClick={() => setCurrentChapterIndex(idx)}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all group
                  ${currentChapterIndex === idx ? 'bg-primary-50 text-primary-900 ring-1 ring-primary-200' : 'text-slate-600 hover:bg-surface-50'}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`text-[10px] font-bold mt-1 w-5 shrink-0 ${currentChapterIndex === idx ? 'text-primary-400' : 'text-slate-300 group-hover:text-slate-400'}`}>
                    {(idx + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="line-clamp-2 leading-relaxed">{chapter.title}</span>
                </div>
              </button>
            ))}
          </nav>
        </aside>

        {/* Reader View */}
        <main className="flex-1 overflow-y-auto book-scroll bg-surface-100 flex flex-col items-center w-full relative">
          
          {/* OFF-SCREEN PDF GENERATOR CONTAINER */}
          {/* This container renders ALL content for PDF generation but stays hidden from user view */}
          <div 
            ref={printContainerRef} 
            className="fixed left-[-9999px] top-0 w-[800px] bg-white z-[-1]"
            aria-hidden="true"
          >
             {/* Cover */}
             <div className="w-full h-[1120px] relative flex flex-col bg-slate-900">
                {book.coverImage && <img src={book.coverImage} className="w-full h-2/3 object-cover opacity-80" />}
                <div className="flex-1 p-16 flex flex-col justify-center items-center text-center">
                   <h1 className="text-5xl font-bold text-white mb-6 font-serif">{book.config.title}</h1>
                   <h2 className="text-2xl text-slate-300 font-sans tracking-widest uppercase">{book.config.authorName}</h2>
                </div>
             </div>
             {/* Chapters */}
             {book.outline.map((ch, i) => (
                <div key={ch.id} className="w-full bg-white p-16 min-h-[1000px]">
                   <h2 className="text-4xl font-bold mb-8 font-serif text-slate-900">Chapter {i+1}: {ch.title}</h2>
                   {ch.imageUrl && <img src={ch.imageUrl} className="w-full h-[400px] object-cover mb-10 rounded-lg shadow-sm" />}
                   <div className="prose prose-lg max-w-none text-slate-700 font-serif leading-loose">
                     <ReactMarkdown>{ch.content || ''}</ReactMarkdown>
                   </div>
                   {/* We include SVGs in PDF but non-interactive */}
                   {ch.content?.includes('```svg') && (
                      <div className="mt-8 p-4 border border-slate-200 rounded-lg bg-surface-50">
                         <div dangerouslySetInnerHTML={{ __html: ch.content.match(/```svg([\s\S]*?)```/)?.[1] || '' }} />
                      </div>
                   )}
                </div>
             ))}
          </div>

          {/* User Visible Content */}
          <div className="w-full max-w-3xl bg-white shadow-2xl shadow-surface-200/50 min-h-full flex flex-col no-print">
            
            {/* Cover View */}
            {currentChapterIndex === -1 && (
              <div className="flex-1 flex flex-col w-full h-full relative">
                 <div className="relative w-full h-[50vh] md:h-[60vh] bg-slate-900 overflow-hidden group">
                    {book.coverImage ? (
                      <img src={book.coverImage} alt="Cover" className="w-full h-full object-cover opacity-80 mix-blend-overlay" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/50">
                          <Loader2 className="w-10 h-10 animate-spin" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-8 md:p-20 text-center z-10 flex flex-col items-center justify-end h-full">
                      <h1 className="text-3xl md:text-6xl font-black text-white font-serif mb-6 drop-shadow-xl leading-tight tracking-tight max-w-4xl">
                        {book.config.title}
                      </h1>
                      <div className="w-20 h-1 bg-primary-500 rounded-full mb-6"></div>
                      <p className="text-base md:text-xl text-slate-200 font-medium tracking-widest uppercase font-sans max-w-2xl mb-4">
                        {book.config.topic}
                      </p>
                      {book.config.authorName && (
                        <p className="text-white/80 font-serif italic text-lg">by {book.config.authorName}</p>
                      )}
                    </div>
                 </div>
                 <div className="p-8 md:p-16 text-center bg-white flex-1 flex flex-col justify-center items-center">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-10 border border-slate-200 rounded-full px-4 py-2">
                       Generated by eBook Architect
                    </div>
                    <button 
                      onClick={handleNext}
                      className="group relative px-8 py-4 bg-slate-900 text-white rounded-xl hover:bg-primary-600 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 flex items-center gap-3 font-bold text-base"
                    >
                      <span>Begin Reading</span> 
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                 </div>
              </div>
            )}

            {/* Chapter View */}
            {currentChapter && (
              <article className="animate-fade-in flex-1 flex flex-col w-full bg-white">
                {/* Chapter Image Header */}
                <div className="w-full h-[35vh] md:h-[45vh] relative group bg-surface-100 overflow-hidden shrink-0">
                    {currentChapter.imageUrl ? (
                       <img 
                        src={currentChapter.imageUrl} 
                        alt={currentChapter.title} 
                        className={`w-full h-full object-cover transition-all duration-700 ${regeneratingImage ? 'opacity-50 blur-sm' : 'opacity-100'}`}
                       />
                    ) : (
                       <div className="w-full h-full flex items-center justify-center text-slate-300 bg-surface-100">
                           <ImageIcon className="w-12 h-12" />
                       </div>
                    )}
                    
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-transparent opacity-60"></div>

                    {/* Regenerate Overlay */}
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={handleRegenerateImage}
                            disabled={regeneratingImage}
                            className="bg-white/90 backdrop-blur text-slate-800 p-2.5 rounded-xl shadow-lg hover:bg-primary-600 hover:text-white transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                        >
                            {regeneratingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            Redraw
                        </button>
                    </div>
                </div>

                <div className="px-8 py-12 md:px-20 md:py-16 w-full flex-1">
                  <div className="text-center mb-12">
                     <span className="inline-block text-primary-600 font-bold tracking-[0.2em] uppercase text-[10px] mb-4 border-b border-primary-100 pb-2">
                         Chapter {currentChapterIndex + 1}
                     </span>
                     <h2 className="text-3xl md:text-4xl font-serif font-medium text-slate-900 leading-tight">
                         {currentChapter.title}
                     </h2>
                  </div>

                  {isEditing ? (
                      <div className="space-y-4">
                          <textarea 
                             className="w-full h-[60vh] p-6 text-base md:text-lg font-serif leading-relaxed text-slate-700 bg-surface-50 border border-surface-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-shadow shadow-inner"
                             value={editBuffer}
                             onChange={(e) => setEditBuffer(e.target.value)}
                          />
                          <div className="flex gap-3 justify-end">
                              <button onClick={() => setIsEditing(false)} className="px-5 py-2.5 text-slate-500 hover:text-slate-800 text-sm font-medium">Cancel</button>
                              <button onClick={handleSaveEdit} className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-bold shadow-lg shadow-primary-500/20">Save Changes</button>
                          </div>
                      </div>
                  ) : (
                    <>
                        <div className="prose prose-slate prose-base md:prose-lg max-w-none font-serif text-slate-600 leading-loose">
                            <ReactMarkdown
                              components={{
                                p: ({node, ...props}) => <p className="mb-6" {...props} />,
                                h1: ({node, ...props}) => <h2 className="text-xl md:text-2xl font-sans font-bold text-slate-900 mt-10 mb-4" {...props} />, // Map h1 to h2 style
                                h2: ({node, ...props}) => <h3 className="text-lg md:text-xl font-sans font-bold text-slate-800 mt-10 mb-4" {...props} />,
                                h3: ({node, ...props}) => <h4 className="text-base md:text-lg font-sans font-bold text-slate-800 mt-8 mb-3 uppercase tracking-wide" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc list-outside ml-5 mb-6 space-y-2 marker:text-primary-400" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-5 mb-6 space-y-2 marker:text-primary-400 font-medium" {...props} />,
                                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary-200 pl-6 italic text-slate-500 my-8 py-2" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-bold text-slate-800" {...props} />,
                                a: ({node, ...props}) => <a className="text-primary-600 underline decoration-primary-200 underline-offset-2 hover:decoration-primary-500 transition-colors" {...props} />,
                              }}
                            >
                              {displayContent}
                            </ReactMarkdown>
                        </div>

                        {/* Render SVGs below text block to prevent overlap */}
                        <InteractiveSvg content={currentChapter.content || ""} />
                    </>
                  )}
                </div>
              </article>
            )}

            {/* Navigation Footer */}
            <div className="sticky bottom-0 border-t border-surface-100 p-4 md:p-6 flex justify-between items-center bg-white/95 backdrop-blur-md z-20 no-print">
               <button 
                onClick={handlePrev}
                disabled={currentChapterIndex === -1}
                className="text-slate-400 hover:text-slate-800 disabled:opacity-0 flex items-center gap-2 text-sm font-medium px-4 py-2 transition-colors"
               >
                 <ChevronLeft className="w-4 h-4" /> <span className="hidden md:inline">Previous</span>
               </button>
               
               <button 
                onClick={handleNext}
                disabled={currentChapterIndex === book.outline.length - 1}
                className="bg-slate-900 text-white hover:bg-primary-600 disabled:opacity-0 disabled:pointer-events-none flex items-center gap-3 text-sm font-bold px-6 py-3 rounded-full transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
               >
                 <span className="hidden md:inline">Next Chapter</span> <span className="md:hidden">Next</span> <ChevronRight className="w-4 h-4" />
               </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default BookReader;