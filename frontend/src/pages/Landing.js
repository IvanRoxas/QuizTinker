import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Code, Database, Brain, Globe, Layout, Layers, Server, Cloud, Settings, PenTool, BarChart2 } from 'lucide-react';
import TeamCard from '../components/TeamCard';
import './Landing.css';

function Landing() {
  const [activeSection, setActiveSection] = useState('home');
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['home', 'offer', 'contact', 'tools', 'about'];
      const scrollPos = window.scrollY + 100;

      for (const section of sections) {
        const element = document.getElementById(section);
        if (element &&
          scrollPos >= element.offsetTop &&
          scrollPos < element.offsetTop + element.offsetHeight) {
          setActiveSection(section);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  const toolsData = [
    {
      name: "React.js",
      tech: "Frontend",
      description: "A powerful JavaScript library for building dynamic and responsive user interfaces.",
      icon: <Layout className="tool-icon" />,
      alt: false
    },
    {
      name: "Django",
      tech: "Backend",
      description: "Robust PHP framework providing elegant syntax and essential tools for secure server-side logic.",
      icon: <Code className="tool-icon" />,
      alt: true
    },
    {
      name: "PostgreSQL",
      tech: "Database",
      description: "Reliable relational database management system for storing user data and quiz content.",
      icon: <Database className="tool-icon" />,
      alt: false
    },
    {
      name: "NGINX",
      tech: "Caching",
      description: "High-performance HTTP server and reverse proxy responsible for serving static content and load balancing.",
      icon: <Server className="tool-icon" />,
      alt: true
    },
    {
      name: "Amazon Web Services",
      tech: "Deployment",
      description: "Comprehensive cloud computing platform providing reliable infrastructure for hosting and scaling applications.",
      icon: <Cloud className="tool-icon" />,
      alt: false
    }
  ];

  const loremShort = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.";

  return (
    <div className="landing-wrapper">
      {/* 1. Sticky Navigation Bar */}
      <nav className="nav-container">
        <img src="/Brand Images/QT-header.png" className="nav-logo-img" alt="QuizTinker Logo" onClick={() => scrollTo('home')} style={{ cursor: 'pointer' }} />
        <div className="nav-links">
          <a
            href="#home"
            className={activeSection === 'home' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); scrollTo('home'); }}
          >
            Home
          </a>
          <a
            href="#offer"
            className={activeSection === 'offer' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); scrollTo('offer'); }}
          >
            What We Offer
          </a>
          <a
            href="#contact"
            className={activeSection === 'contact' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); scrollTo('contact'); }}
          >
            How It Works
          </a>

          <a
            href="#tools"
            className={activeSection === 'tools' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); scrollTo('tools'); }}
          >
            Tools Used
          </a>

          <a
            href="#about"
            className={activeSection === 'about' ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); scrollTo('about'); }}
          >
            About Us
          </a>
        </div>

        <button className="login-btn" onClick={() => navigate('/auth')}>Log In</button>
      </nav>

      {/* 2. Hero Section */}
      <section id="home" className="hero-section">
        <div className="hero-card">
          <h1>WELCOME TO<br />QUIZDECK!</h1>
          <p>We invent knowledge, and with knowledge comes the power to make things right. Experience a brand new way to learn! </p>
          <button className="signup-btn" onClick={() => navigate('/auth')}>GET STARTED!</button>
        </div>
      </section>

      {/* 3. What We Offer Section */}
      <section id="offer" className="offer-section">
        <div className="offer-content-left">
          <h2 style={{ fontSize: '3.5rem', marginBottom: '3rem', color: '#1E1E1E' }} className="section-title">WHAT WE OFFER</h2>
          <div className="feature-list">
            <div className="feature-item">
              <div className="icon-circle icon-blue"></div>
              <div className="feature-content">
                <h3>Intelligent Generation</h3>
                <p>Use integrated tools to draft comprehensive question sets based on your source material or topics.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="icon-circle icon-orange"></div>
              <div className="feature-content">
                <h3>Academic Rigor</h3>
                <p>An intuitive system designed to support deadlines and quiz editing.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="icon-circle icon-blue"></div>
              <div className="feature-content">
                <h3>Seamless A.I. Integration</h3>
                <p>Create meaning review quizzes with the help of artificial intelligence.</p>
              </div>
            </div>
            <div className="feature-item">
              <div className="icon-circle icon-orange"></div>
              <div className="feature-content">
                <h3>Insightful Analytics</h3>
                <p>Access detailed reports on performance metrics and student statistics in real-time.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mockup-placeholder"></div>
      </section>

      {/* 4. How It Works Section */}
      <section id="contact" className="contact-container">
        <div className="contact-blocks">
          <div className="contact-block block-orange">
            <div className="contact-icon">
              <Settings size={80} />
            </div>
            <h3>Outline Rules</h3>
            <p>Configure your quiz parameters including time limits, deadlines, and penalty percentages.</p>
          </div>
          <div className="contact-block block-blue">
            <div className="contact-icon">
              <PenTool size={80} />
            </div>
            <h3>Build Content</h3>
            <p>Manually design your questions or use our engine to generate them from descriptions.</p>
          </div>
          <div className="contact-block block-orange">
            <div className="contact-icon">
              <BarChart2 size={80} />
            </div>
            <h3>Analyze Results</h3>
            <p>Nourish your academic growth and monitor your progress through our comprehensive dashboard.</p>
          </div>
        </div>
      </section>

      {/* 5. Tools Used Section */}
      <section id="tools" className="tools-section">
        <h2 className="section-title">Tools Used</h2>
        <div className="tools-grid">
          {toolsData.map((tool, index) => (
            <div key={index} className={`flip-card ${tool.alt ? 'alt' : ''}`}>
              <div className="flip-card-inner">
                <div className="flip-card-front">
                  {tool.icon}
                  <h3>{tool.name}</h3>
                  <span className="tech-name">{tool.tech}</span>
                </div>
                <div className="flip-card-back">
                  <h3>{tool.name}</h3>
                  <p>{tool.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. About Us Section */}
      <section id="about" className="about-section">
        <h2>Meet the QuizTinker Team!</h2>
        <p style={{ fontSize: '1.5rem', margin: '0 0 30px 30px' }}>
          Get to know the brilliant minds behind QuizTinker! They poured their heart and soul into this project (obviously), and collaborated to provide the users the best academic reviewing experience.
          Driven by a passion for continuous development and innovation, these five individuals are sure to surprise you with their taste for success!
        </p>

        <div className="team-row">
          {[
            {
              name: "Alexa Nicole Dela Cruz",
              role: "Project Leader & Documentation",
              image: "/About Us Images/alexa.jpg",
              facebookUrl: "https://www.facebook.com/alexanicole.delacruz",
              linkedinUrl: "#"
            },
            {
              name: "Daniel Aaron Espela",
              role: "AI & Deployment Specialist",
              image: "/About Us Images/daniel.jpeg",
              facebookUrl: "https://www.facebook.com/profile.php?id=61583034644682",
              linkedinUrl: "https://www.linkedin.com/in/espela-daniel/"
            },
            {
              name: "Josh Michael Fangonilo",
              role: "Documentation",
              image: "/About Us Images/josh.jpg",
              facebookUrl: "https://www.facebook.com/joshfangonilo",
              linkedinUrl: "https://www.linkedin.com/in/josh-michael-fangonilo-196782390/"
            },
            {
              name: "Alexandra Pauline Martinez",
              role: "UI/UX Designer",
              image: "/About Us Images/alex.jpg",
              facebookUrl: "https://www.facebook.com/MacyneCalphys",
              linkedinUrl: "#"
            },
            {
              name: "John Ivan Roxas",
              role: "Backend Developer",
              image: "/About Us Images/ivan.jpg",
              facebookUrl: "https://www.facebook.com/IvanRoxas2004",
              linkedinUrl: "https://www.linkedin.com/in/john-ivan-roxas-b4b85a38b/"
            }
          ].map((member) => (
            <TeamCard
              key={member.name}
              name={member.name}
              role={member.role}
              image={member.image}
              facebookUrl={member.facebookUrl}
              linkedinUrl={member.linkedinUrl}
            />
          ))}
        </div>
      </section>


      {/* 7. Footer */}
      <footer className="footer-redesign">
        <div className="footer-column logo-column">
          <img src="/Brand Images/QT-Brand.png" className="footer-logo-img" alt="QuizTinker" />
        </div>
        <div className="footer-column about-column">
          <h4 className="footer-heading">About This Project</h4>
          <p className="footer-text">
            QuizTinker is an AI-powered quiz generation platform. This project was created as a Final Requirement for the Web Systems and Technologies 2 Course by 3rd-year BSIT students.
          </p>
          <p className="footer-school">Technological Institute of the Philippines - Manila</p>
        </div>
        <div className="footer-column team-column">
          <h4 className="footer-heading">Development Team</h4>
          <ul className="footer-team-list">
            <li><strong>Alexa Nicole Dela Cruz</strong></li>
            <li><strong>Daniel Aaron Espela</strong></li>
            <li><strong>Josh Michael Fangonilo</strong></li>
            <li><strong>Alexandra Pauline Martinez</strong></li>
            <li><strong>John Ivan Roxas</strong></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
