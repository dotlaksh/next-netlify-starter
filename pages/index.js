import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import axios from 'axios';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

const StockChartCarousel = () => {
  const [indexData] = useState([
    { label: 'Nifty 50', data: nifty50Data },
    { label: 'Nifty Next 50', data: niftyNext50Data },
    { label: 'Midcap 150', data: midcap150Data },
    { label: 'Smallcap 250', data: smallcap250Data },
    { label: 'MicroCap 250', data: microCap250Data },
  ]);
  const [selectedIndexId, setSelectedIndexId] = useState(0);
  const [currentStockIndex, setCurrentStockIndex] = useState(0);
  const [stocks, setStocks] = useState([]);
  const [chartsData, setChartsData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('YTD');
  const [selectedInterval, setSelectedInterval] = useState('daily');
  const [currentStock, setCurrentStock] = useState(null);
  const [transition, setTransition] = useState(false);

  const chartContainerRef = useRef(null);
  const chartInstancesRef = useRef({});
  const carouselRef = useRef(null);

  const getChartHeight = useCallback(() => {
    return window.innerWidth < 768 ? 500 : 800;
  }, []);

  useEffect(() => {
    const selectedIndex = indexData[selectedIndexId];
    const stocksList = selectedIndex.data.map(item => ({
      symbol: item.Symbol,
      name: item["Company Name"],
      industry: item.Industry
    }));
    setStocks(stocksList);
    setCurrentStockIndex(0);
    setChartsData({});
  }, [selectedIndexId, indexData]);

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

  const fetchStockData = useCallback(async (stockIndex) => {
    if (!stocks.length) return;
    
    const stock = stocks[stockIndex];
    const cacheKey = `${stock.symbol}-${selectedPeriod}-${selectedInterval}`;
    
    if (chartsData[cacheKey]) {
      return chartsData[cacheKey];
    }
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      const period = TIME_PERIODS.find(p => p.label === selectedPeriod);
      startDate.setDate(endDate.getDate() - (period?.days || 365));

      const response = await axios.get('/api/stockData', {
        params: {
          symbol: stock.symbol,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        }
      });

      const formattedData = response.data.map(item => ({
        time: new Date(item.time).getTime() / 1000,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume
      }));

      const adjustedData = aggregateData(formattedData, selectedInterval);
      
      setChartsData(prev => ({
        ...prev,
        [cacheKey]: adjustedData
      }));

      return adjustedData;
    } catch (err) {
      setError(err.response?.data?.details || 'Failed to fetch stock data');
      return null;
    }
  }, [stocks, selectedPeriod, selectedInterval, chartsData]);

  const createChartInstance = useCallback((container, data, stockIndex) => {
    if (!container || !data) return null;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: getChartHeight(),
      layout: { 
        background: { type: 'solid', color: '#f8fafc' }, 
        textColor: '#1f2937'
      },
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

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    candlestickSeries.setData(data);

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    volumeSeries.setData(data.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? '#26a69a80' : '#ef535080',
    })));

    chart.timeScale().fitContent();
    return chart;
  }, [getChartHeight]);

  const updateCharts = useCallback(async () => {
    if (!carouselRef.current) return;

    const visibleIndices = [
      Math.max(0, currentStockIndex - 1),
      currentStockIndex,
      Math.min(stocks.length - 1, currentStockIndex + 1)
    ];

    setLoading(true);

    for (const index of visibleIndices) {
      const chartContainer = carouselRef.current.children[index];
      if (!chartContainer) continue;

      const data = await fetchStockData(index);
      if (!data) continue;

      if (chartInstancesRef.current[index]) {
        chartInstancesRef.current[index].remove();
      }

      chartInstancesRef.current[index] = createChartInstance(chartContainer, data, index);

      if (index === currentStockIndex) {
        const stock = stocks[index];
        setCurrentStock({
          name: stock.name,
          symbol: stock.symbol,
          industry: stock.industry,
          price: data[data.length - 1]?.close,
          change: ((data[data.length - 1]?.close - data[0]?.open) / data[0]?.open) * 100,
        });
      }
    }

    setLoading(false);
  }, [currentStockIndex, stocks, fetchStockData, createChartInstance]);

  useEffect(() => {
    updateCharts();
    return () => {
      Object.values(chartInstancesRef.current).forEach(chart => chart?.remove());
      chartInstancesRef.current = {};
    };
  }, [updateCharts]);

  const handleIntervalChange = (newInterval) => {
    const autoTimeframe = INTERVALS.find((i) => i.value === newInterval)?.autoTimeframe;
    setSelectedInterval(newInterval);
    if (autoTimeframe) {
      setSelectedPeriod(autoTimeframe);
    }
  };

  const handlePrevious = () => {
    if (currentStockIndex > 0) {
      setTransition(true);
      setCurrentStockIndex(prev => prev - 1);
      setTimeout(() => setTransition(false), 300);
    }
  };

  const handleNext = () => {
    if (currentStockIndex < stocks.length - 1) {
      setTransition(true);
      setCurrentStockIndex(prev => prev + 1);
      setTimeout(() => setTransition(false), 300);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-gray-600 text-white py-3 px-4 flex justify-between items-center z-10">
        <h1 className="text-lg font-semibold">dotCharts</h1>
        <select
          className="bg-white text-gray-700 rounded px-2 py-1 text-sm"
          value={selectedIndexId}
          onChange={(e) => setSelectedIndexId(parseInt(e.target.value))}
        >
          {indexData.map((item, index) => (
            <option key={index} value={index}>
              {item.label}
            </option>
          ))}
        </select>
      </header>

      {currentStock && (
        <div className="flex flex-col items-center py-2 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{currentStock.name}</span>
            <span className="text-xs text-gray-500">({currentStock.symbol})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{currentStock.price?.toFixed(2)}</span>
            <span className={`text-sm ${currentStock.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ({currentStock.change?.toFixed(2)}%)
            </span>
          </div>
          <span className="text-xs text-gray-500">{currentStock.industry}</span>
        </div>
      )}

      <main className="flex-grow relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
            <div className="text-center">Loading...</div>
          </div>
        )}
        {error ? (
          <div className="text-red-500 text-center p-4">{error}</div>
        ) : (
          <div className="relative h-full">
            <div
              ref={carouselRef}
              className="flex transition-transform duration-300 ease-in-out h-full"
              style={{
                transform: `translateX(-${currentStockIndex * 100}%)`,
              }}
            >
              {stocks.map((_, index) => (
                <div
                  key={index}
                  className="w-full flex-shrink-0 p-4"
                  style={{ height: getChartHeight() }}
                />
              ))}
            </div>
            <button
              onClick={handlePrevious}
              disabled={currentStockIndex === 0}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white p-2 rounded-full shadow-lg disabled:opacity-50 disabled:cursor-not-allowed z-20"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={handleNext}
              disabled={currentStockIndex === stocks.length - 1}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white p-2 rounded-full shadow-lg disabled:opacity-50 disabled:cursor-not-allowed z-20"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        )}
      </main>

      <footer className="sticky bottom-0 bg-white py-3 px-4 flex justify-between items-center border-t">
        <div className="flex items-center gap-4">
          <span className="text-sm">
            {currentStockIndex + 1} / {stocks.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-white text-gray-700 rounded px-2 py-1 text-sm"
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

export default StockChartCarousel;
