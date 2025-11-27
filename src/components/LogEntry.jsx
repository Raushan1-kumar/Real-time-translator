// src/components/LogEntry.jsx
import React from 'react';

const LogEntry = ({ type, text, source, timestamp }) => {
    let colorClasses = '';
    let icon = '';

    switch (type) {
        case 'input':
            colorClasses = 'text-green-700 bg-green-100';
            icon = '🎤';
            break;
        case 'translation-text':
            colorClasses = 'text-blue-700 bg-blue-100';
            icon = '📝';
            break;
        case 'translation-audio':
            colorClasses = 'text-purple-700 bg-purple-100';
            icon = '🔊';
            break;
        case 'error':
            colorClasses = 'text-red-700 bg-red-100';
            icon = '❌';
            break;
        default:
            colorClasses = 'text-gray-600 bg-gray-50';
            icon = 'ℹ️';
    }

    return (
        <div className={`p-3 my-2 rounded-lg shadow-sm ${colorClasses}`}>
            <span className="font-bold mr-2 text-sm">{timestamp} {icon}</span>
            <span className="font-medium">{text}</span>
            {source && <span className="text-xs text-gray-500 italic ml-2">({source})</span>}
        </div>
    );
};

export default LogEntry;