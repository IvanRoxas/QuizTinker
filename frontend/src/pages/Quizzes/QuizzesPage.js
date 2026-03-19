import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { fetchQuizzes } from '../../api/quizApi';
import QuizCard from '../../components/QuizCard';
import CreateQuizModal from '../../components/CreateQuizModal';
import { Plus, Search, ChevronDown } from 'lucide-react';
import EmptyState from '../../components/EmptyState';
import './QuizzesPage.css';

const FILTER_OPTIONS = [
    { label: 'All Quizzes', value: 'all' },
    { label: 'Made by me', value: 'mine' },
    { label: 'By Friends', value: 'friends' },
    { label: 'AI Generated', value: 'ai' },
];

const SORT_OPTIONS = [
    { label: 'Newest First', value: 'newest' },
    { label: 'Oldest First', value: 'oldest' },
    { label: 'Alphabetical (A-Z)', value: 'az' },
    { label: 'Alphabetical (Z-A)', value: 'za' },
];

const QuizzesPage = () => {
    const { user } = useAuth();
    const location = useLocation();

    const [quizzes, setQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'published');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState(location.state?.activeFilter || 'all');
    const [sortOption, setSortOption] = useState('newest');
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = React.useRef(null);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [editingQuiz, setEditingQuiz] = useState(null);

    const loadQuizzes = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch published and drafts in parallel just like Dashboard
            const [publishedData, draftsData] = await Promise.all([
                fetchQuizzes({ status: 'published' }),
                fetchQuizzes({ status: 'draft', mine: true })
            ]);
            setQuizzes([...publishedData, ...draftsData]);
        } catch (err) {
            console.error('Failed to fetch quizzes', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadQuizzes();
    }, [loadQuizzes]);

    // Close logic
    useEffect(() => {
        const handleClick = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Filtering & Sorting Logic
    const getDisplayList = () => {
        // 1. Initial status filter
        let list = quizzes.filter(q => q.status === (activeTab === 'published' ? 'published' : 'draft'));

        // 2. Search
        if (searchTerm) {
            list = list.filter(q => q.title.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        // 3. Category/Author Filter
        list = list.filter(q => {
            switch (activeFilter) {
                case 'mine':
                    return q.author === user?.id;
                case 'friends':
                    return (q.availability === 'all_friends' || q.availability === 'specific_friends') && q.author !== user?.id;
                case 'ai':
                    return q.generation_type === 'ai';
                default:
                    return true;
            }
        });

        // 4. Sorting for both
        list.sort((a, b) => {
            switch (sortOption) {
                case 'oldest':
                    return new Date(a.created_at) - new Date(b.created_at);
                case 'az':
                    return a.title.localeCompare(b.title);
                case 'za':
                    return b.title.localeCompare(a.title);
                case 'newest':
                default:
                    return new Date(b.created_at) - new Date(a.created_at);
            }
        });

        return list;
    };

    const displayList = getDisplayList();

    const handleCreate = () => {
        setEditingQuiz(null);
        setModalOpen(true);
    };

    const handleCardClick = (quiz) => {
        // Only drafts are editable from here
        setEditingQuiz(quiz);
        setModalOpen(true);
    };

    const handleSaved = (savedQuiz, action) => {
        if (action === 'create') {
            setQuizzes(prev => [savedQuiz, ...prev]);
        } else {
            setQuizzes(prev => prev.map(q => q.id === savedQuiz.id ? savedQuiz : q));
        }
    };

    const hasQuizzesData = !loading && displayList.length > 0;
    const filterLabel = FILTER_OPTIONS.find(f => f.value === activeFilter)?.label || 'Filter';
    const sortLabel = SORT_OPTIONS.find(s => s.value === sortOption)?.label || 'Sort';
    const currentFilterLabel = `${filterLabel} | ${sortLabel}`;

    return (
        <main className="quizzes-page">
            <div className="quizzes-page-header">
                <h1>{activeTab === 'published' ? 'All Quizzes' : 'My Drafts'}</h1>
                <button className="create-quiz-btn-header" onClick={handleCreate}>
                    <Plus size={20} />
                    <span>Create a Draft</span>
                </button>
            </div>

            <div className="quizzes-controls-row">
                <div className="quizzes-tabs">
                    <button
                        className={`quizzes-tab ${activeTab === 'published' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('published'); setActiveFilter('all'); }}
                    >
                        Quizzes
                    </button>
                    <button
                        className={`quizzes-tab ${activeTab === 'draft' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('draft'); setActiveFilter('all'); }}
                    >
                        Drafts
                    </button>
                </div>

                <div className="quizzes-filters-group">
                    <div className="filter-dropdown-wrapper" ref={filterRef}>
                        <button
                            className="filter-btn-neo"
                            onClick={() => setFilterOpen(!filterOpen)}
                        >
                            <span>{currentFilterLabel}</span>
                            <ChevronDown size={16} />
                        </button>
                        {filterOpen && (
                            <div className="filter-dropdown-menu">
                                <div style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', backgroundColor: '#f8fafc' }}>FILTER BY</div>
                                {FILTER_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`filter-option ${activeFilter === opt.value ? 'active' : ''}`}
                                        onClick={() => { setActiveFilter(opt.value); setFilterOpen(false); }}
                                    >
                                        {opt.label}
                                    </button>
                                  ))}
                                <div style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>SORT BY</div>
                                {SORT_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`filter-option ${sortOption === opt.value ? 'active' : ''}`}
                                        onClick={() => { setSortOption(opt.value); setFilterOpen(false); }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="quiz-inline-search">
                <Search size={20} className="quiz-inline-search-icon" />
                <input
                    type="text"
                    placeholder={activeTab === 'published' ? "Search quizzes..." : "Search drafts..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Content */}
            {loading ? (
                <div className="quizzes-loading">
                    <div className="quizzes-loading-spinner" />
                    <p>Loading quizzes…</p>
                </div>
            ) : displayList.length === 0 ? (
                /* Empty state */
                <div className="quizzes-empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <EmptyState 
                        title={activeTab === 'published' ? 'No Quizzes' : 'No Drafts'} 
                        description={activeTab === 'published' ? "Try changing your filters or searching for something else." : "You don't have any drafts right now. Start creating!"}
                    >
                        {activeTab === 'draft' && (
                            <button className="create-quiz-btn-big" onClick={handleCreate}>
                                <Plus size={28} />
                                <span>Create a Draft</span>
                            </button>
                        )}
                    </EmptyState>
                </div>
            ) : (
                /* Populated state */
                <div className="quizzes-grid">
                    {displayList.map(quiz => (
                        <QuizCard key={quiz.id} quiz={quiz} onClick={handleCardClick} />
                    ))}
                </div>
            )}

            <CreateQuizModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setEditingQuiz(null); }}
                quizData={editingQuiz}
                onSaved={handleSaved}
            />
        </main>
    );
};

export default QuizzesPage;
