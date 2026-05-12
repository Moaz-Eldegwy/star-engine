import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-50 bg-gray-900 flex flex-col items-center justify-center p-8 text-white">
          <i className="fa-solid fa-triangle-exclamation text-6xl text-red-500 mb-6"></i>
          <h1 className="text-3xl font-bold text-red-400 mb-4">UI Crashed</h1>
          <p className="text-lg text-gray-300 mb-6 text-center max-w-2xl">
            {this.state.error && this.state.error.toString()}
          </p>
          <div className="bg-gray-800 p-4 rounded text-left overflow-auto w-full max-w-4xl font-mono text-sm text-gray-400 mb-6">
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-bold transition-colors"
          >
            Refresh Page
          </button>
          <p className="mt-4 text-sm text-gray-500">
            (If you just installed new npm packages, you may need to restart the Vite dev server)
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
