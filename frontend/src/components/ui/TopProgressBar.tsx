/**
 * v1.88.4 顶部细进度条：筛选/翻页等二次加载时展示（保留旧内容，不整页 loading）
 * 首次加载仍用整页 loading 占位；此后的一切数据刷新都用本组件轻提示。
 */
export default function TopProgressBar() {
  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[60] h-[3px] w-full overflow-hidden">
      <div
        className="h-full w-2/5 rounded-full bg-gradient-to-r from-brand-400 via-orange-400 to-brand-500"
        style={{
          animation: "mengyaSlide 1.1s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes mengyaSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  );
}
