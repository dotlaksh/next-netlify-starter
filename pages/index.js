"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import nifty50Data from '/public/nifty50.json';
import niftyNext50Data from '/public/niftynext50.json';
import midcap150Data from '/public/midcap150.json';
import smallcap250Data from '/public/smallcap250.json';
import microCap250Data from '/public/microcap250.json';

const TIME_PERIODS = [
  { label: 'YTD', days: 365, auto: 'ytd' },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
  { label: '5Y', days: 1825 },
  { label: 'Max', days: 3650 },
];

const INTERVALS = [
  { label: 'Daily', value: 'daily', autoTimeframe: 'YTD' },
  { label: 'Weekly', value: 'weekly', autoTimeframe: '2Y' },
  { label: 'Monthly', value: 'monthly', autoTimeframe: '5Y' },
];

const StockChart = () => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentStockIndex, setCurrentStockIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('YTD');
  const [selectedInterval, setSelectedInterval] = useState('daily');
  const [currentStock, setCurrentStock] = useState(null);

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const indexData = [
    { label: 'Nifty 50', data: nifty50Data },
    { label: 'Nifty Next 50', data: niftyNext50Data },
    { label: 'Midcap 150', data: midcap150Data },
    { label: 'Smallcap 250', data: smallcap250Data },
    { label: 'MicroCap 250', data: microCap250Data },
  ];

  const getChartHeight = useCallback(() => {
    return window.innerWidth < 768 ? 300 : 400;
  }, []);

  const aggregateData = (data, interval) => {
    if (interval === 'daily') return data;

    const aggregatedData = [];
    const periodMap = {};

    data.forEach((item) => {
      const date = new Date(item.time * 1000);
      let periodKey;

      if (interval === 'weekly') {
        const startOfWeek = new Date(date.setDate(date.getDate() - date.getDay()));
        periodKey = startOfWeek.toISOString().slice(0, 10);
      } else if (interval === 'monthly') {
        periodKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      }

      if (!periodMap[periodKey]) {
        periodMap[periodKey] = {
          time: item.time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
        };
      } else {
        periodMap[periodKey].high = Math.max(periodMap[periodKey].high, item.high);
        periodMap[periodKey].low = Math.min(periodMap[periodKey].low, item.low);
        periodMap[periodKey].close = item.close;
        periodMap[periodKey].volume += item.volume;
      }
    });

    return Object.values(periodMap).sort((a, b) => a.time - b.time);
  };

  const loadStockData = useCallback(() => {
    setLoading(true);
    try {
      const currentIndexData = indexData[selectedIndex].data;
      // Group data by date for the current stock
      const stockSymbol = [...new Set(currentIndexData.map(item => item.symbol))][currentStockIndex];
      const stockData = currentIndexData.filter(item => item.symbol === stockSymbol);

      const formattedData = stockData.map((item) => ({
        time: new Date(item.date).getTime() / 1000,
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
        volume: parseFloat(item.volume),
      }));

      const adjustedData = aggregateData(formattedData, selectedInterval);
      
      setChartData(adjustedData);
      setCurrentStock({
        name: stockSymbol,
        price: adjustedData[adjustedData.length - 1]?.close,
        change: ((adjustedData[adjustedData.length - 1]?.close - adjustedData[0]?.open) / adjustedData[0]?.open) * 100,
      });
    } catch (err) {
      setError('Failed to load stock data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedIndex, currentStockIndex, selectedInterval]);

  useEffect(() => {
    loadStockData();
  }, [loadStockData]);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: getChartHeight(),
      layout: { background: { type: 'solid', color: '#f8fafc' }, textColor: '#1f2937' },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        timeVisible: true,
        borderColor: '#cbd5e1',
        rightOffset: 5,
        minBarSpacing: 5,
      },
      rightPriceScale: {
        autoScale: true,
      },
    });

    const mainSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceScaleId: 'right',
    });

    mainSeries.setData(chartData);

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    volumeSeries.setData(chartData.map((d) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? '#26a69a80' : '#ef535080',
    })));

    chart.timeScale().fitContent();
    chartInstanceRef.current = chart;

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: getChartHeight(),
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [chartData, getChartHeight]);

  const handleIntervalChange = (newInterval) => {
    const autoTimeframe = INTERVALS.find((i) => i.value === newInterval)?.autoTimeframe;
    setSelectedInterval(newInterval);
    if (autoTimeframe) {
      setSelectedPeriod(autoTimeframe);
    }
  };

  const handlePrevious = () => {
    setCurrentStockIndex((prev) => {
      if (prev > 0) return prev - 1;
      return prev;
    });
  };

  const handleNext = () => {
    const totalStocks = new Set(indexData[selectedIndex].data.map(item => item.symbol)).size;
    setCurrentStockIndex((prev) => {
      if (prev < totalStocks - 1) return prev + 1;
      return prev;
    });
  };

  const handleIndexChange = (event) => {
    const newIndex = parseInt(event.target.value);
    setSelectedIndex(newIndex);
    setCurrentStockIndex(0); // Reset to first stock when index changes
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-blue-600 text-white py-3 px-4 flex justify-between items-center">
        <h1 className="text-lg font-semibold">Stock Charts</h1>
        <select
          className="bg-white text-gray-700 rounded px-2 py-1 text-sm"
          value={selectedIndex}
          onChange={handleIndexChange}
        >
          {indexData.map((item, index) => (
            <option key={index} value={index}>
              {item.label}
            </option>
          ))}
        </select>
      </header>

      {currentStock && (
        <div className="flex justify-center items-center py-2 bg-white shadow-sm">
          <span className="text-sm font-bold mr-2">{currentStock.name}</span>
          <span className="text-sm font-semibold">
            {currentStock.price.toFixed(2)} ({currentStock.change.toFixed(2)}%)
          </span>
        </div>
      )}

      <main className="flex-grow flex items-center justify-center p-4">
        {loading ? (
          <div className="text-center">Loading...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          <div ref={chartContainerRef} className="w-full h-full shadow-lg rounded-lg bg-white" />
        )}
      </main>

      <footer className="sticky bottom-0 bg-white py-3 px-4 flex justify-between items-center border-t">
        <button
          onClick={handlePrevious}
          disabled={currentStockIndex === 0}
          className="text-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="text-sm">
          {currentStockIndex + 1} / {new Set(indexData[selectedIndex].data.map(item => item.symbol)).size}
        </span>
        <button
          onClick={handleNext}
          disabled={currentStockIndex === new Set(indexData[selectedIndex].data.map(item => item.symbol)).size - 1}
          className="text-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
        <div className="flex items-center">
          <select
            className="bg-white text-gray-700 rounded px-2 py-1 mr-2 text-sm"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            {TIME_PERIODS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            className="bg-white text-gray-700 rounded px-2 py-1 text-sm"
            value={selectedInterval}
            onChange={(e) => handleIntervalChange(e.target.value)}
          >
            {INTERVALS.map((interval) => (
              <option key={interval.value} value={interval.value}>
                {interval.label}
              </option>
            ))}
          </select>
        </div>
      </footer>
    </div>
  );
};

export default StockChart;
