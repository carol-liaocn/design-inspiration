import React, { useState, useEffect } from 'react';
import RotatingSphere from './RotatingSphere';
import LoadingSpinner from '../LoadingSpinner';
import './HomePage.css';

// 错误边界组件
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full w-full">
          <div className="text-center">
            <div className="w-32 h-32 bg-design-yellow rounded-full flex items-center justify-center mb-4 mx-auto">
              <span className="text-4xl text-black">🎨</span>
            </div>
            <h2 className="text-xl text-light-gray">设计友好报</h2>
            <p className="text-light-gray opacity-60 mt-2">探索创意设计世界</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const HomePage = ({ activeTab, setActiveTab }) => {
  const [isLoading, setIsLoading] = useState(true);

  // 减少首页加载时间，提升用户体验
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800); // 0.8秒后隐藏loading，更快响应

    return () => clearTimeout(timer);
  }, []);

  const navItems = [
    { id: 'inspiration', label: 'inspiration' },
    { id: 'artist', label: 'artist' },
    { id: 'team project', label: 'team project' }
  ];

  return (
    <div className="homepage">
      {/* Loading 覆盖层 */}
      {isLoading && (
        <LoadingSpinner 
          fullScreen={true}
          size="xl"
          text="正在加载设计友好报..."
        />
      )}

      {/* 左侧导航栏 - 与标准Sidebar完全一致 */}
      <div className={`fixed left-0 top-0 h-full w-80 z-10 transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        {/* Logo区域 */}
        <div className="px-8 py-8">
          <div className="flex items-center">
            <h1 className="text-light-gray text-2xl font-bold whitespace-nowrap">
              设计友好报
            </h1>
            <span className="ml-4 text-2xl">🔎</span>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="px-8 space-y-1.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className="block text-left text-2xl font-medium uppercase tracking-wide transition-colors duration-200 whitespace-nowrap text-light-gray opacity-60 hover:opacity-80"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 右上角REDesign标志 */}
      <div className={`redesign-logo transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        <img 
          src="/images/redesign-logo.svg" 
          alt="REDesign" 
          className="h-full w-auto"
          onError={(e) => {
            e.target.style.display = 'none';
            console.log('REDesign logo loading failed');
          }}
        />
      </div>

      {/* 中央球体区域 - 全屏居中 */}
      <div className={`sphere-container transition-opacity duration-500 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        <ErrorBoundary>
          <RotatingSphere />
        </ErrorBoundary>
      </div>
    </div>
  );
};

export default HomePage; 