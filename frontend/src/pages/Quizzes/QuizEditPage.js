import React from 'react';
import { useParams } from 'react-router-dom';

const QuizEditPage = () => {
    const { id } = useParams();

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem',
            gap: '1rem',
        }}>
            <h1 style={{ color: 'var(--blue)', fontSize: '2.5rem', margin: 0 }}>
                Quiz Editor
            </h1>
            <p style={{ color: 'var(--charcoal)', opacity: 0.5, fontWeight: 700, fontSize: '1.1rem' }}>
                Editing Quiz #{id} — Coming Soon
            </p>
        </div>
    );
};

export default QuizEditPage;
