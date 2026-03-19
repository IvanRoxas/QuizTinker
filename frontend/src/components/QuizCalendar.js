import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, X, ChevronUp, ChevronDown } from 'lucide-react';
import './QuizCalendar.css';

const QuizCalendar = ({ quizzes = [], variant = 'full' }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedDayQuizzes, setSelectedDayQuizzes] = useState(null);
    const scrollContainerRef = useRef(null);
    const todayRef = useRef(null);

    const today = new Date();
    const isToday = (year, month, day) => {
        return today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day;
    };

    // Calendar logic
    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => {
        let day = new Date(year, month, 1).getDay();
        return day === 0 ? 6 : day - 1; // Adjust to start Monday (0=Mon, 6=Sun)
    };

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const calendarDays = useMemo(() => {
        const totalDays = daysInMonth(year, month);
        const startDay = firstDayOfMonth(year, month);
        const days = [];

        // --- Calculate padding from PREVIOUS month ---
        const prevYear = month === 0 ? year - 1 : year;
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevMonthTotalDays = daysInMonth(prevYear, prevMonth);

        for (let i = startDay - 1; i >= 0; i--) {
            const d = prevMonthTotalDays - i;
            const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push({
                day: d,
                dateStr,
                quizzes: [], // Usually don't show deadlines for other months to avoid clutter
                isToday: false,
                isCurrentMonth: false
            });
        }

        // --- CURRENT month days ---
        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const now = new Date();
            const dayQuizzes = quizzes.filter(q => {
                if (!q.deadline) return false;
                const deadDate = new Date(q.deadline);
                return deadDate.getFullYear() === year && 
                       deadDate.getMonth() === month && 
                       deadDate.getDate() === d;
            });

            const isLateDay = dayQuizzes.some(q => new Date(q.deadline) < now && q.allow_late_submissions);

            days.push({ 
                day: d, 
                dateStr, 
                quizzes: dayQuizzes,
                isToday: isToday(year, month, d),
                isCurrentMonth: true,
                isLate: isLateDay
            });
        }

        // --- Calculate padding from NEXT month ---
        const nextYear = month === 11 ? year + 1 : year;
        const nextMonth_ = month === 11 ? 0 : month + 1;
        const remainingCells = 42 - days.length; // 6 rows of 7 days
        for (let d = 1; d <= remainingCells; d++) {
            const dateStr = `${nextYear}-${String(nextMonth_ + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            days.push({
                day: d,
                dateStr,
                quizzes: [],
                isToday: false,
                isCurrentMonth: false
            });
        }

        return days;
    }, [year, month, quizzes]);


    useEffect(() => {
        if (isExpanded && todayRef.current && scrollContainerRef.current && variant === 'full') {
            const container = scrollContainerRef.current;
            const element = todayRef.current;

            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const elementRelativeTop = elementRect.top - containerRect.top + container.scrollTop;

            const targetScroll = elementRelativeTop - 40;

            container.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }
    }, [isExpanded, calendarDays, month, variant]);

    const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    return (
        <div className={`quiz-calendar-container variant-${variant} ${!isExpanded ? 'collapsed' : ''}`}>
            {/* Header */}
            <div className="calendar-header-v2">
                <div className="calendar-left">
                    <CalendarIcon size={variant === 'compact' ? 18 : 22} className="header-icon" />
                    <span className="current-month-year">
                        {monthNames[month].toUpperCase()} {year}
                    </span>
                </div>
                <div className="calendar-actions">
                    <div className="nav-controls">
                        <button className="nav-arrow" onClick={prevMonth}><ChevronLeft size={16} /></button>
                        <button className="nav-arrow" onClick={nextMonth}><ChevronRight size={16} /></button>
                    </div>
                    <button
                        className="toggle-expand-btn"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        {isExpanded ? (
                            <span className="btn-text">Hide</span>
                        ) : (
                            <span className="btn-text">Show</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Weekdays Row (Sticky) */}
            {isExpanded && (
                <div className="calendar-weekdays">
                    {weekdays.map(d => (
                        <div key={d} className="weekday-label">{variant === 'compact' ? d[0] : d}</div>
                    ))}
                </div>
            )}

            {/* Grid */}
            {isExpanded && (
                <div className="calendar-body-v2" ref={scrollContainerRef}>
                    <div className="calendar-grid-v2">

                        {calendarDays.map((dateObj, idx) => {
                            if (!dateObj) return <div key={`padding-${idx}`} className="day-cell padding"></div>;

                            const quizTitles = dateObj.quizzes.map(q => q.title).join(', ');
                            const now = new Date();

                            return (
                                <div
                                    key={dateObj.dateStr}
                                    ref={dateObj.isToday && dateObj.isCurrentMonth ? todayRef : null}
                                    className={`day-cell ${dateObj.isToday ? 'today' : ''} ${dateObj.quizzes.length > 0 ? 'clickable' : ''} ${!dateObj.isCurrentMonth ? 'neighbor-month' : ''} ${dateObj.isLate ? 'late-day' : ''}`}
                                    title={quizTitles || undefined}
                                    onClick={() => dateObj.quizzes.length > 0 && setSelectedDayQuizzes(dateObj)}
                                >
                                    <span className="day-num">{dateObj.day}</span>
                                    {dateObj.quizzes.length > 0 && (
                                        <div className="deadline-dots">
                                            {dateObj.quizzes.slice(0, 3).map((quiz, i) => {
                                                const isPast = new Date(quiz.deadline) < now;
                                                const isLateClickable = isPast && quiz.allow_late_submissions;
                                                return (
                                                    <div 
                                                        key={i} 
                                                        className={isLateClickable ? "red-dot" : "blue-dot"}
                                                    ></div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {/* Footer removed per user request */}
                </div>
            )}

            {/* Detail Modal */}
            {selectedDayQuizzes && ReactDOM.createPortal(
                <div className="calendar-modal-overlay-v2" onClick={() => setSelectedDayQuizzes(null)}>
                    <div className="calendar-day-modal-v2" onClick={e => e.stopPropagation()}>
                        <div className="modal-header-v2">
                            <div className="modal-title-group">
                                <CalendarIcon size={20} />
                                <h3>Deadlines for {monthNames[month]} {selectedDayQuizzes.day}, {year}</h3>
                            </div>
                            <button className="close-modal-btn" onClick={() => setSelectedDayQuizzes(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-scroll-area">
                            {selectedDayQuizzes.quizzes.length > 0 ? (
                                selectedDayQuizzes.quizzes.map(quiz => {
                                    const isPast = new Date(quiz.deadline) < new Date();
                                    const isLate = isPast && quiz.allow_late_submissions;

                                    return (
                                        <div key={quiz.id} className={`modal-quiz-card ${isLate ? 'is-late' : ''}`}>
                                            <div className="quiz-card-info">
                                                <div className="quiz-card-title-row">
                                                    <span className="quiz-card-title">{quiz.title}</span>
                                                    {isLate && <span className="late-label">(LATE)</span>}
                                                </div>
                                                <div className="quiz-card-meta">
                                                    <Clock size={14} />
                                                    <span>Due: {quiz.deadline ? new Date(quiz.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time set'}</span>
                                                </div>
                                            </div>
                                            <button
                                                className={`modal-view-btn ${isLate ? 'late' : ''}`}
                                                onClick={() => window.location.href = `/quizzes/${quiz.id}/intro`}
                                            >
                                                Take Quiz
                                            </button>
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="no-deadlines-text">No deadlines for this day.</p>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default QuizCalendar;
