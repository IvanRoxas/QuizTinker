import React, { useState, useRef } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check } from 'lucide-react';
import './ImageCropModal.css';

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
    return centerCrop(
        makeAspectCrop(
            {
                unit: '%',
                width: 90,
            },
            aspect,
            mediaWidth,
            mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
    );
}

const ImageCropModal = ({ isOpen, onClose, imageSrc, aspect, onSave, title }) => {
    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState(null);
    const imgRef = useRef(null);

    const onImageLoad = (e) => {
        const { width, height } = e.currentTarget;
        setCrop(centerAspectCrop(width, height, aspect));
    };

    const handleSave = () => {
        if (!completedCrop || !imgRef.current) return;

        const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
        const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

        const cropData = {
            x: completedCrop.x * scaleX,
            y: completedCrop.y * scaleY,
            width: completedCrop.width * scaleX,
            height: completedCrop.height * scaleY,
        };

        onSave(cropData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="crop-modal-overlay">
            <div className="crop-modal-content">
                <div className="crop-modal-header">
                    <h3>{title}</h3>
                    <button className="close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="crop-workspace">
                    {imageSrc && (
                        <ReactCrop
                            crop={crop}
                            onChange={(_, percentCrop) => setCrop(percentCrop)}
                            onComplete={(c) => setCompletedCrop(c)}
                            aspect={aspect}
                            circularCrop={aspect === 1}
                        >
                            <img
                                ref={imgRef}
                                alt="Crop preview"
                                src={imageSrc}
                                onLoad={onImageLoad}
                                style={{ maxHeight: '60vh', width: 'auto' }}
                            />
                        </ReactCrop>
                    )}
                </div>

                <div className="crop-modal-footer">
                    <button className="cancel-btn" onClick={onClose}>Cancel</button>
                    <button className="confirm-btn" onClick={handleSave}>
                        <Check size={16} /> Apply Crop
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImageCropModal;
