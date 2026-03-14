import React from 'react';
import './EmptyState.css';

const EmptyState = ({ title, description, children }) => {
    return (
        <div className="empty-state-container">
            <h3 className="empty-state-title">{title}</h3>
            <p className="empty-state-desc">{description}</p>
            {children && <div className="empty-state-actions">{children}</div>}
        </div>
    );
};

export default EmptyState;
