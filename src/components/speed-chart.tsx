"use client";

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

interface SpeedChartProps {
  data: Array<{
    label: string;
    speed: number | null;
  }>;
}

export function SpeedChart({ data }: SpeedChartProps) {
  const width = Math.max(960, data.length * 42);

  return (
    <div className="chart-scroll">
      <LineChart width={width} height={330} data={data} margin={{ top: 16, right: 24, left: 0, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#d7dde5" />
        <XAxis dataKey="label" minTickGap={32} tick={{ fontSize: 12 }} />
        <YAxis unit="km/h" tick={{ fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="speed" stroke="#0f8f7a" strokeWidth={3} dot={false} />
      </LineChart>
    </div>
  );
}
