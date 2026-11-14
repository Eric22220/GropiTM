import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface UPlotProps {
  data: uPlot.AlignedData;
  series: uPlot.Series[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  xTime?: boolean;
  onCursor?: (idx: number | null) => void;
  ariaLabel: string;
  bands?: uPlot.Band[];
  scalesY?: uPlot.Scale;
}

export function UPlot({ data, series, height = 200, xLabel, yLabel, xTime = false, onCursor, ariaLabel, scalesY }: UPlotProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const plot = useRef<uPlot | null>(null);
  const cb = useRef(onCursor);
  cb.current = onCursor;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = Math.max(260, el.clientWidth);
    // canvas-ul nu înțelege variabilele CSS: citim culoarea efectivă
    const fg = getComputedStyle(el).color || '#14212b';
    const opts: uPlot.Options = {
      width,
      height,
      scales: { x: { time: xTime }, ...(scalesY ? { y: scalesY } : {}) },
      axes: [
        { label: xLabel, stroke: fg, grid: { stroke: 'rgba(128,128,128,.2)' }, ticks: { stroke: 'rgba(128,128,128,.3)' } },
        { label: yLabel, stroke: fg, grid: { stroke: 'rgba(128,128,128,.2)' }, ticks: { stroke: 'rgba(128,128,128,.3)' } },
      ],
      series: [{}, ...series],
      cursor: { drag: { x: true, y: false } },
      hooks: { setCursor: [(u) => cb.current?.(u.cursor.idx ?? null)] },
      legend: { show: true },
    };
    plot.current = new uPlot(opts, data, el);
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: Math.max(260, el.clientWidth), height }));
    ro.observe(el);
    return () => { ro.disconnect(); plot.current?.destroy(); plot.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, height]);
  return <div ref={ref} role="img" aria-label={ariaLabel} className="chart" />;
}
