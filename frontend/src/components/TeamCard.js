import React from 'react';
import { Facebook, Linkedin } from 'lucide-react';
import './TeamCard.css';

const TeamCard = ({ name, role, image, facebookUrl, linkedinUrl }) => {
    return (
        <div className="team-card-wrapper">
            <div className="team-card-main group">
                {/* Background Image */}
                <div className="team-card-image-container">
                    <img src={image} alt={name} className="team-card-image" />
                </div>

                {/* Social Tabs (Left Slide-out) */}
                <div className="social-tabs-container">
                    <a href={facebookUrl || "#"} className="social-tab facebook-tab" aria-label="Facebook" target="_blank" rel="noopener noreferrer">
                        <Facebook size={20} />
                    </a>
                    <a href={linkedinUrl || "#"} className="social-tab linkedin-tab" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer">
                        <Linkedin size={20} />
                    </a>
                </div>

                {/* Text Overlay (Bottom) */}
                <div className="text-overlay">
                    <div className="gradient-bg"></div>
                    <div className="text-content">
                        <h3 className="team-name">{name}</h3>
                        <p className="team-role">{role}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TeamCard;
