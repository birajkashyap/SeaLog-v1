/**
 * SeaLog Research Graph Generator
 *
 * Generates two publication-quality PNG graphs from benchmark data:
 *   1. Merkle Proof Size vs Log Volume
 *   2. Verification Time vs Log Volume
 *
 * Usage:
 *   npx ts-node benchmarks/generate_graphs.ts
 *
 * Output:
 *   benchmarks/results/proof_size_vs_n.png
 *   benchmarks/results/verification_time_vs_n.png
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration } from 'chart.js';
import * as fs from 'fs';
import * as path from 'path';

// ─── Benchmark Data ───────────────────────────────────────────────────────────
// Source: SeaLog live benchmark run, April 2026.
// Proof size derived from merkle_proof.siblings.length × 32 bytes (Keccak-256).
// Verification time is the average over K=5 log verifications per N.

const N_VALUES = [10, 50, 100, 500];
const PROOF_SIZES   = [128, 192, 224, 288];   // bytes
const VERIFY_TIMES  = [4.69, 3.97, 5.64, 23.71]; // ms (avg of K=5 per N)

// ─── Canvas Setup ─────────────────────────────────────────────────────────────

const WIDTH  = 1200;
const HEIGHT = 800;

const canvas = new ChartJSNodeCanvas({
  width: WIDTH,
  height: HEIGHT,
  backgroundColour: 'white',
});

// ─── Output Directory ─────────────────────────────────────────────────────────

const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// ─── Shared Style Constants ───────────────────────────────────────────────────

const FONT_FAMILY = 'sans-serif';

const BASE_CHART_OPTIONS = {
  responsive: false,
  animation: false as const,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    x: {
      grid: {
        display: true,
        color: '#dddddd',
      },
      ticks: {
        font: {
          size: 16,
          family: FONT_FAMILY,
        },
        color: '#222222',
      },
      title: {
        display: true,
        font: {
          size: 18,
          family: FONT_FAMILY,
        },
        color: '#111111',
        padding: { top: 12 },
      },
    },
    y: {
      grid: {
        display: true,
        color: '#dddddd',
      },
      ticks: {
        font: {
          size: 16,
          family: FONT_FAMILY,
        },
        color: '#222222',
      },
      title: {
        display: true,
        font: {
          size: 18,
          family: FONT_FAMILY,
        },
        color: '#111111',
        padding: { bottom: 12 },
      },
    },
  },
  layout: {
    padding: {
      top: 30,
      right: 40,
      bottom: 20,
      left: 20,
    },
  },
};

// ─── Graph 1: Proof Size vs N ─────────────────────────────────────────────────

async function generateProofSizeGraph(): Promise<void> {
  const config: ChartConfiguration = {
    type: 'line',
    data: {
      labels: N_VALUES.map(String),
      datasets: [
        {
          label: 'Proof Size (bytes)',
          data: PROOF_SIZES,
          borderColor: '#1565C0',       // solid blue
          backgroundColor: '#1565C0',
          borderWidth: 2.5,
          pointRadius: 7,
          pointHoverRadius: 9,
          pointBackgroundColor: '#1565C0',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          tension: 0,                   // raw lines, no smoothing
          fill: false,
        },
      ],
    },
    options: {
      ...BASE_CHART_OPTIONS,
      plugins: {
        ...BASE_CHART_OPTIONS.plugins,
        title: {
          display: true,
          text: 'Merkle Proof Size vs Log Volume',
          font: {
            size: 22,
            family: FONT_FAMILY,
            weight: 'bold',
          },
          color: '#111111',
          padding: { bottom: 20 },
        },
      },
      scales: {
        x: {
          ...BASE_CHART_OPTIONS.scales.x,
          title: {
            ...BASE_CHART_OPTIONS.scales.x.title,
            text: 'Number of Logs (N)',
          },
        },
        y: {
          ...BASE_CHART_OPTIONS.scales.y,
          min: 100,
          max: 320,
          title: {
            ...BASE_CHART_OPTIONS.scales.y.title,
            text: 'Proof Size (bytes)',
          },
        },
      },
    },
  };

  const buffer = await canvas.renderToBuffer(config);
  const outPath = path.join(resultsDir, 'proof_size_vs_n.png');
  fs.writeFileSync(outPath, buffer);
  console.log(`  ✔ Saved: ${outPath}`);
}

// ─── Graph 2: Verification Time vs N ─────────────────────────────────────────

async function generateVerificationTimeGraph(): Promise<void> {
  const config: ChartConfiguration = {
    type: 'line',
    data: {
      labels: N_VALUES.map(String),
      datasets: [
        {
          label: 'Verification Time (ms)',
          data: VERIFY_TIMES,
          borderColor: '#2E7D32',       // solid green
          backgroundColor: '#2E7D32',
          borderWidth: 2.5,
          pointRadius: 7,
          pointHoverRadius: 9,
          pointBackgroundColor: '#2E7D32',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          tension: 0,
          fill: false,
        },
      ],
    },
    options: {
      ...BASE_CHART_OPTIONS,
      plugins: {
        ...BASE_CHART_OPTIONS.plugins,
        title: {
          display: true,
          text: 'Verification Time vs Log Volume',
          font: {
            size: 22,
            family: FONT_FAMILY,
            weight: 'bold',
          },
          color: '#111111',
          padding: { bottom: 20 },
        },
      },
      scales: {
        x: {
          ...BASE_CHART_OPTIONS.scales.x,
          title: {
            ...BASE_CHART_OPTIONS.scales.x.title,
            text: 'Number of Logs (N)',
          },
        },
        y: {
          ...BASE_CHART_OPTIONS.scales.y,
          min: 0,
          title: {
            ...BASE_CHART_OPTIONS.scales.y.title,
            text: 'Verification Time (ms)',
          },
        },
      },
    },
  };

  const buffer = await canvas.renderToBuffer(config);
  const outPath = path.join(resultsDir, 'verification_time_vs_n.png');
  fs.writeFileSync(outPath, buffer);
  console.log(`  ✔ Saved: ${outPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n  SeaLog — Research Graph Generator');
  console.log('  ──────────────────────────────────');
  console.log(`  Output directory : ${resultsDir}`);
  console.log(`  Resolution       : ${WIDTH} × ${HEIGHT} px\n`);

  await generateProofSizeGraph();
  await generateVerificationTimeGraph();

  console.log('\n  Both graphs generated successfully.\n');
}

main().catch((err: Error) => {
  console.error(`\n[ERROR] ${err.message}`);
  process.exit(1);
});
