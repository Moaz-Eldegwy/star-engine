// Tiny educational drag-drop game. Kept as a "shows you can ship UX"
// detail rather than the AI-RAG centerpiece. Untouched from the original
// other than being lifted to its own module.

import { useState } from 'react';

export function HypothesisBuilder({ publication }) {
  const [feedback, setFeedback] = useState(null);

  const cause =
    publication.keywords.find((k) => k === 'Microgravity' || k === 'Radiation') ||
    'Spaceflight';
  const effect =
    publication.keywords.find(
      (k) =>
        k.toLowerCase().includes('atrophy') ||
        k.toLowerCase().includes('loss') ||
        k.toLowerCase().includes('decrease'),
    ) || 'Biological Change';

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.getData('text/plain') === 'cause') {
      setFeedback({ correct: true, message: `Correct! ${cause} causes ${effect} in this study.` });
      e.target.classList.add('hypothesis-correct');
    } else {
      setFeedback({ correct: false, message: 'Not quite, try the other concept.' });
    }
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-white mb-2">Hypothesis Builder</h3>
      <p className="text-gray-400 mb-6">Drag the correct cause to the drop zone.</p>
      <div className="flex justify-around items-center h-48 bg-gray-900/50 p-4 rounded-lg">
        <div className="flex flex-col items-center">
          <div
            className="hypothesis-item bg-indigo-600 p-4 rounded-lg shadow-lg text-center"
            draggable="true"
            onDragStart={(e) => e.dataTransfer.setData('text/plain', 'cause')}
          >
            <i className="fa-solid fa-rocket mr-2"></i> {cause}
          </div>
          <div
            className="hypothesis-item mt-4 bg-purple-600 p-4 rounded-lg shadow-lg text-center"
            draggable="true"
            onDragStart={(e) => e.dataTransfer.setData('text/plain', 'other')}
          >
            <i className="fa-solid fa-flask mr-2"></i> Random Factor
          </div>
        </div>
        <i className="fa-solid fa-arrow-right-long text-3xl text-gray-500"></i>
        <div
          className="hypothesis-drop-zone w-48 h-24 border-2 border-gray-600 rounded-lg flex items-center justify-center text-gray-500"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          Drop Cause
        </div>
        <i className="fa-solid fa-arrow-right-long text-3xl text-gray-500"></i>
        <div className="bg-green-800/50 border border-green-500 p-4 rounded-lg text-center">
          <i className="fa-solid fa-dna mr-2"></i> {effect}
        </div>
      </div>
      {feedback && (
        <p
          className={`mt-4 text-center font-semibold ${
            feedback.correct ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}

export default HypothesisBuilder;
