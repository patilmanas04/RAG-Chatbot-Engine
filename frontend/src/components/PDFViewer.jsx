import React, { useEffect, useState, useMemo } from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { searchPlugin } from '@react-pdf-viewer/search';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';
import { zoomPlugin } from '@react-pdf-viewer/zoom';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/search/lib/styles/index.css';
import '@react-pdf-viewer/page-navigation/lib/styles/index.css';
import '@react-pdf-viewer/zoom/lib/styles/index.css';

const PDFViewer = ({ fileUrl, pageNumber = 1, exactQuote = '' }) => {
  // Initialize plugins directly at the top level.
  // @react-pdf-viewer plugins use React hooks internally, so they CANNOT be placed inside useMemo!
  const searchPluginInstance = searchPlugin();
  const pageNavigationPluginInstance = pageNavigationPlugin();
  const zoomPluginInstance = zoomPlugin();

  const { highlight } = searchPluginInstance;
  const { jumpToPage } = pageNavigationPluginInstance;
  const { ZoomIn, ZoomOut, CurrentScale } = zoomPluginInstance;
  const { GoToPreviousPage, GoToNextPage, CurrentPageLabel } = pageNavigationPluginInstance;

  // Jump to page when pageNumber prop changes
  useEffect(() => {
    if (pageNumber && jumpToPage) {
      // react-pdf-viewer uses 0-based page indexing
      jumpToPage(pageNumber - 1);
    }
  }, [pageNumber]); // Deliberately omit jumpToPage to prevent infinite loops

  // Highlight exactQuote when it changes
  useEffect(() => {
    if (exactQuote && highlight) {
      const cleanQuote = exactQuote.trim();
      if (!cleanQuote) return;
      
      // The `@react-pdf-viewer/search` programmatic highlight API has a known bug where it crashes if passed a RegExp.
      // To make the search extremely robust against smart-quotes, em-dashes, and hidden newlines without using RegExp,
      // we split the quote by punctuation and ask the plugin to highlight all the resulting text chunks simultaneously!
      const segments = cleanQuote
        .split(/[.,;:"“”'’\-\–\—\n\r\(\)\[\]]+/)
        .map(s => s.trim())
        .filter(s => s.length >= 8); // Only highlight substantial chunks to avoid lighting up random small words everywhere
      
      // The `@react-pdf-viewer/search` API expects an array of configuration objects.
      // We map each punctuation-split text chunk into its own search configuration object.
      const searchChunks = segments.length > 0 ? segments : [cleanQuote];
      const searchConfigs = searchChunks.map(chunk => ({
        keyword: chunk,
        matchCase: false,
      }));
      
      highlight(searchConfigs);
    }
  }, [exactQuote]); // Deliberately omit highlight to prevent infinite loops

  return (
    <div className="flex flex-col h-full bg-[#525659] w-full">
      {/* Custom Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#323639] text-white shadow-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <ZoomOut>
            {(props) => (
              <button onClick={props.onClick} className="w-7 h-7 flex items-center justify-center hover:bg-white/10 rounded transition-colors cursor-pointer" title="Zoom Out">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
              </button>
            )}
          </ZoomOut>
          <CurrentScale>
            {(props) => <span className="text-xs font-medium w-12 text-center">{Math.round(props.scale * 100)}%</span>}
          </CurrentScale>
          <ZoomIn>
            {(props) => (
              <button onClick={props.onClick} className="w-7 h-7 flex items-center justify-center hover:bg-white/10 rounded transition-colors cursor-pointer" title="Zoom In">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
            )}
          </ZoomIn>
        </div>
        
        <div className="flex items-center gap-3">
          <GoToPreviousPage>
            {(props) => (
              <button disabled={props.isDisabled} onClick={props.onClick} className="w-7 h-7 flex items-center justify-center hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer" title="Previous Page">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
          </GoToPreviousPage>
          <CurrentPageLabel>
            {(props) => <span className="text-xs font-medium">Page {props.currentPage + 1} of {props.numberOfPages}</span>}
          </CurrentPageLabel>
          <GoToNextPage>
            {(props) => (
              <button disabled={props.isDisabled} onClick={props.onClick} className="w-7 h-7 flex items-center justify-center hover:bg-white/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer" title="Next Page">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </GoToNextPage>
        </div>
      </div>

      {/* PDF Document Container */}
      <div className="flex-1 overflow-auto bg-[#525659] relative">
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
          <Viewer
            fileUrl={fileUrl}
            plugins={[searchPluginInstance, pageNavigationPluginInstance, zoomPluginInstance]}
            initialPage={pageNumber ? pageNumber - 1 : 0}
            theme="dark"
          />
        </Worker>
      </div>
    </div>
  );
};

export default PDFViewer;
