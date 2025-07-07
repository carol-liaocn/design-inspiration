import React from 'react';

const ProjectModal = ({ project, onClose }) => {
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 判断文件是否为视频
  const isVideo = (imagePath) => {
    const videoExtensions = ['.mp4', '.webm', '.mov', '.avi'];
    return videoExtensions.some(ext => imagePath.toLowerCase().endsWith(ext));
  };

  // 渲染媒体内容（图片或视频）
  const renderMedia = (src, alt, className = "w-full h-full object-cover") => {
    if (isVideo(src)) {
      return (
        <video
          src={src}
          autoPlay
          loop
          muted
          className={className}
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.parentNode.style.backgroundColor = '#D9D9D9';
          }}
        />
      );
    } else {
      return (
        <img
          src={src}
          alt={alt}
          className={className}
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.parentNode.style.backgroundColor = '#D9D9D9';
          }}
        />
      );
    }
  };

  // 处理assets字符串，将分号分隔的字符串转换为数组
  const processAssets = (assetsString) => {
    if (!assetsString) return [];
    // 分割字符串并去除空格
    const assetsArray = assetsString.split(';').map(asset => asset.trim()).filter(asset => asset);
    return assetsArray.map((asset, index) => ({
      src: asset,
      id: `asset-${index}`,
      aspectRatio: '1/1' // 统一使用1:1正方形比例
    }));
  };

  const assetItems = project.assets ? processAssets(project.assets) : [];

  return (
    <div 
      className="fixed inset-0 bg-dark-bg bg-opacity-80 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      {/* Close button positioned outside the modal */}
      <button 
        onClick={onClose}
        className="fixed top-8 left-4 w-10 h-10 bg-design-yellow flex items-center justify-center z-60"
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#131313" strokeWidth="1">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div className="bg-design-yellow max-h-[80vh] w-full mx-16 overflow-hidden flex" style={{ maxWidth: '86.4rem' }}>
        {/* Left side - Image Gallery */}
        <div className="w-[70%] bg-design-yellow min-h-0" style={{ paddingLeft: '1.2%' }}>
          {/* Scrollable image grid */}
          <div className="h-full overflow-y-auto min-h-0 scrollbar-hide" style={{ paddingTop: '0', paddingRight: '1rem', paddingBottom: '1rem', paddingLeft: '0' }}>
            <div className="grid grid-cols-2 gap-4">
              {/* Main asset - 主图，跨两列 */}
              {project.main_asset && (
                <div className="col-span-2 aspect-[3/2] bg-design-gray">
                  {renderMedia(project.main_asset, `${project.title} main asset`)}
                </div>
              )}
              
              {/* Additional assets in two-column layout */}
              {assetItems.map((item) => (
                <div 
                  key={item.id}
                  className="bg-design-gray aspect-square"
                >
                  {renderMedia(item.src, `${project.title} asset`)}
                </div>
              ))}
              
              {/* 如果没有assets，显示一些占位图 */}
              {(!project.assets || project.assets.length === 0) && (
                <>
                  <div className="aspect-square bg-design-gray"></div>
                  <div className="aspect-square bg-design-gray"></div>
                  <div className="aspect-square bg-design-gray"></div>
                  <div className="aspect-square bg-design-gray"></div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right side - Content */}
        <div className="w-[30%] bg-design-yellow text-dark-bg flex flex-col min-h-0" style={{ paddingTop: '2rem', paddingBottom: '2rem', paddingRight: '1.2%', paddingLeft: '0' }}>

          <div style={{ marginBottom: '1.5rem' }}>
            <h2 className="font-bold uppercase" style={{ fontSize: '1.5rem', marginBottom: '0.5rem', lineHeight: '1.2' }}>{project.title}</h2>
            <p className="font-medium" style={{ fontSize: '1.125rem', lineHeight: '1.3' }}>by {project.author}</p>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0" style={{ marginBottom: '1.5rem' }}>
            <p className="whitespace-pre-line font-medium text-justify" style={{ fontSize: '1.125rem', lineHeight: '1.625' }}>
              {project.description}
            </p>
          </div>

          <div className="text-left">
            
{Array.isArray(project.link) ? (
  project.link.map((url, index) => (
    <div key={index}>
      <a 
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-dark-bg font-medium underline hover:no-underline block"
        style={{ fontSize: '0.875rem' }}
      >
        {url}
      </a>
    </div>
  ))
) : (
  <a 
    href={project.link}
    target="_blank"
    rel="noopener noreferrer"
    className="text-dark-bg font-medium underline hover:no-underline"
    style={{ fontSize: '0.875rem' }}
  >
    {project.link}
  </a>
)}

          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal; 