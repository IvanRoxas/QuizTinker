import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchQuizzes } from '../api/quizApi';
import QuizCard from '../components/QuizCard';
import CreateQuizModal from '../components/CreateQuizModal';
import { Search, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import './Dashboard.css';

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

const Dashboard = () => {
    const { user } = useAuth();

    // Quizzes state
    const [quizzes, setQuizzes] = useState([]);
    const [drafts, setDrafts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [activeTab, setActiveTab] = useState('quizzes'); // 'quizzes' or 'drafts'
    const [sortOption, setSortOption] = useState('newest');
    const [filterOpen, setFilterOpen] = useState(false);
    const [selectedQuiz, setSelectedQuiz] = useState(null);
    const filterRef = useRef(null);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);

    const loadQuizzes = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch published quizzes and user's drafts in parallel
            const [publishedData, draftsData] = await Promise.all([
                fetchQuizzes({ status: 'published' }),
                fetchQuizzes({ status: 'draft', mine: true })
            ]);
            setQuizzes(publishedData);
            setDrafts(draftsData);
        } catch (err) {
            console.error('Failed to fetch dashboard data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadQuizzes();
    }, [loadQuizzes]);

    // Close filter dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Apply search + filter/sort
    const getDisplayList = () => {
        let list = activeTab === 'quizzes' ? [...quizzes] : [...drafts];

        // 1. Strict status check (Defense)
        if (activeTab === 'quizzes') {
            list = list.filter(q => q.status === 'published');
        } else {
            list = list.filter(q => q.status === 'draft');
        }

        // 2. Search
        if (searchTerm) {
            list = list.filter(q => q.title.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        // 3. Tab-based logic (Filter for Quizzes, Sort for Drafts)
        if (activeTab === 'quizzes') {
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
        } else {
            // Sorting for drafts
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
        }
        return list;
    };

    const displayList = getDisplayList();

    const handleSaved = (savedQuiz, action) => {
        if (action === 'create') {
            if (savedQuiz.status === 'published') {
                setQuizzes(prev => [savedQuiz, ...prev]);
            } else {
                setDrafts(prev => [savedQuiz, ...prev]);
            }
        } else if (action === 'update') {
            // Update in both lists, they will be filtered by displayList anyway
            setQuizzes(prev => prev.map(q => q.id === savedQuiz.id ? savedQuiz : q));
            setDrafts(prev => prev.map(q => q.id === savedQuiz.id ? savedQuiz : q));

            // If a quiz was published, we might need to refresh lists or handle moving logic
            // Since we use getDisplayList which filters by status, updating both is fine.
            // But let's ensure both lists are synced with the new data.
            loadQuizzes(); // Simplest way to ensure status-based separation is clean
        } else if (action === 'delete') {
            setQuizzes(prev => prev.filter(q => q.id !== savedQuiz.id));
            setDrafts(prev => prev.filter(q => q.id !== savedQuiz.id));
        }
    };

    const currentFilterLabel = activeTab === 'quizzes'
        ? (FILTER_OPTIONS.find(f => f.value === activeFilter)?.label || 'Filter')
        : (SORT_OPTIONS.find(s => s.value === sortOption)?.label || 'Sort');

    return (
        <main className="dash-main-content">
            <header className="main-header">
                <div className="header-greeting">
                    <h1>Hello, {user?.name || 'User'}!</h1>
                    <p>What shall we do today?</p>
                </div>
            </header>

            <section className="ranking-banner">
                <div className="banner-content">
                    <h2>RANKING SCORE<br />BOARD PLACEHOLDER</h2>
                    <button className="view-ranks-btn">View Ranks</button>
                </div>
                <div className="banner-graphics">
                    <div className="star star-1">★</div>
                    <div className="star star-2">★</div>
                    <div className="star star-3">★</div>
                </div>
            </section>

            <section className="quizzes-section">
                <div className="quizzes-header-toggle">
                    <span
                        className={`toggle-item ${activeTab === 'quizzes' ? 'active' : ''}`}
                        onClick={() => setActiveTab('quizzes')}
                    >
                        Quizzes
                    </span>
                    <span className="toggle-divider">|</span>
                    <span
                        className={`toggle-item ${activeTab === 'drafts' ? 'active' : ''}`}
                        onClick={() => setActiveTab('drafts')}
                    >
                        Drafts
                    </span>
                </div>

                <div className="quizzes-header">
                    {/* Search bar beside filters */}
                    <div className="quiz-inline-search">
                        <Search size={20} className="quiz-inline-search-icon" />
                        <input
                            type="text"
                            placeholder={activeTab === 'quizzes' ? "Search quizzes..." : "Search drafts..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Filter/Sort dropdown */}
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
                                {activeTab === 'quizzes' ? (
                                    FILTER_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            className={`filter-option ${activeFilter === opt.value ? 'active' : ''}`}
                                            onClick={() => { setActiveFilter(opt.value); setFilterOpen(false); }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))
                                ) : (
                                    SORT_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            className={`filter-option ${sortOption === opt.value ? 'active' : ''}`}
                                            onClick={() => { setSortOption(opt.value); setFilterOpen(false); }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="recent-layout-header">
                    <h3>{activeTab === 'quizzes' ? 'Recent Quizzes' : 'Recent Drafts'}</h3>
                    <Link to="/quizzes" state={{ activeTab: activeTab === 'drafts' ? 'draft' : 'published' }} className="see-all-link">See All</Link>
                </div>

                {/* Content rendering based on tab */}
                {!loading && displayList.length === 0 ? (
                    activeTab === 'drafts' ? (
                        <EmptyState title="No Drafts" description="You don't have any drafts right now. Let's get to work and start creating!" />
                    ) : (
                        (() => {
                            if (activeFilter === 'mine') return <EmptyState title="It's kinda quiet here..." description="You haven't published any quizzes yet!" />;
                            if (activeFilter === 'friends') return <EmptyState title="It's kinda quiet here..." description="Your friends haven't published any quizzes yet!" />;
                            if (activeFilter === 'ai') return <EmptyState title="It's kinda quiet here..." description="You haven't generated any quizzes yet!" />;
                            return <EmptyState title="No Quizzes" description="No quizzes found matching your search." />;
                        })()
                    )
                ) : (
                    <div className="quiz-grid">
                        {loading ? (
                            [1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="quiz-card">
                                    <div className="quiz-image-placeholder" />
                                </div>
                            ))
                        ) : (
                            <>
                                {displayList.slice(0, 6).map(quiz => (
                                    <QuizCard
                                        key={quiz.id}
                                        quiz={quiz}
                                        onClick={(q) => {
                                            setSelectedQuiz(q);
                                            setModalOpen(true);
                                        }}
                                    />
                                ))}

                                {activeTab === 'drafts' && (
                                    <div className="quiz-card-neo create-draft-card-neo" onClick={() => setModalOpen(true)}>
                                        <div className="create-draft-card-content">
                                            <div className="create-draft-icon-circle">
                                                <span className="plus-sign">+</span>
                                            </div>
                                            <span className="create-draft-label">Create Draft</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </section>

            <CreateQuizModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); setSelectedQuiz(null); }}
                quizData={selectedQuiz}
                onSaved={handleSaved}
            />
        </main>
    );
};

export default Dashboard;
