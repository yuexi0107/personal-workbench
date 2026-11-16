// Chart.js 轻封装：三种固定用法（line/doughnut/bar）+ MiniBar 纯CSS小条
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler,
  DoughnutController, ArcElement, BarController, BarElement, Tooltip, Legend,
} from 'chart.js';
import { fmtMoney } from '../store.js';

ChartJS.register(
  LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler,
  DoughnutController, ArcElement, BarController, BarElement, Tooltip, Legend
);

const commonOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { boxWidth: 12, font: { size: 12 } } },
    tooltip: { bodyFont: { size: 12 } },
  },
};

export default function FpChart({ type, data, options = {}, height }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new ChartJS(ref.current, {
      type,
      data,
      options: { ...commonOpts, ...options },
    });
    return () => { chartRef.current && chartRef.current.destroy(); };
  }, [type, data, options]);
  return (
    <div className="chart-box" style={height ? { height } : undefined}>
      <canvas ref={ref} />
    </div>
  );
}

/** 纯 CSS 占比小条：values=[{label, value, color}]。
 *  段间有 2px 底色缝（分隔"小块"），悬停某段高亮并弹出提示：资金名、金额、占比。
 *  提示锚定在段中心，贴近容器左右边缘时向内收拢（而不是溢出撑出横向滚动条）。 */
export function MiniBar({ values }) {
  const [hover, setHover] = useState(null);
  const barRef = useRef(null);
  const tipRef = useRef(null);
  // 提示框中心横坐标（px）：按悬浮段中心定位后测量钳制 —— 贴边段（如「借出应收」）
  // 不再把提示顶出容器、在页面上撑出横向滚动条
  const [tipLeft, setTipLeft] = useState(null);
  const total = values.reduce((s, v) => s + Math.max(0, v.value), 0);
  // 段中心位置（百分比），悬浮提示锚定在段中心
  let cum = 0;
  const centers = values.map((v) => {
    const center = cum + (Math.max(0, v.value) / total) * 50;
    cum += (Math.max(0, v.value) / total) * 100;
    return center;
  });
  // 悬停段变化后同步测量（useLayoutEffect 在绘制前完成钳制，定位无闪烁）：
  // 提示框中心钳在容器内、左右各留 4px
  useLayoutEffect(() => {
    if (hover == null) { setTipLeft(null); return; }
    const bar = barRef.current;
    const tip = tipRef.current;
    if (!bar || !tip) return;
    const bw = bar.clientWidth;
    const half = tip.offsetWidth / 2;
    if (!bw || !half) return;
    const center = (centers[hover] / 100) * bw;
    setTipLeft(Math.min(Math.max(center, half + 4), bw - half - 4));
  }, [hover, centers]);
  if (total <= 0) return null;
  return (
    <div className="bar" style={{ height: 10 }} ref={barRef}>
      {values.map((v, i) => {
        const pct = (Math.max(0, v.value) / total) * 100;
        return (
          <i key={i}
             style={{ width: `calc(${pct}% - 2px)`, background: v.color }}
             onMouseEnter={() => setHover(i)}
             onMouseLeave={() => setHover(i === hover ? null : hover)} />
        );
      })}
      {hover != null && values[hover] && (
        <span
          ref={tipRef}
          className="bar-tip"
          style={tipLeft != null ? { left: tipLeft, transform: 'translateX(-50%)' } : { left: `${centers[hover]}%` }}
        >
          {values[hover].label}：¥{fmtMoney(values[hover].value)}（{Math.round((values[hover].value / total) * 100)}%）
        </span>
      )}
    </div>
  );
}
