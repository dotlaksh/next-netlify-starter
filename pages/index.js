import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';
import Dropdown from 'react-bootstrap/Dropdown';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import 'bootstrap/dist/css/bootstrap.min.css';

const TIME_PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

// Create loading placeholder component
const ChartLoadingPlaceholder = () => {
  return (
    <div className="w-100 h-100 d-flex justify-content-center align-items-center">
      <div className="text-center">
        <Spinner animation="border" role="status" variant="primary" />
        <div className="mt-2">Loading chart data...</div>
      </div>
    </div>
  );
};

const StockChart = () => {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('3M');
  const [currentStats, setCurrentStats] = useState(null);
  
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const resizeObserverRef = useRef(null);

  // Calculate chart height based on container height
  const getChartHeight = useCallback(() => {
    if (chartContainerRef.current) {
      return chartContainerRef.current.clientHeight;
    }
    return 600;
  }, []);

  // Load CSV data
  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const symbols = results.data.map(row => row.Symbol).filter(Boolean);
            setStockSymbols(symbols);
            if (symbols.length) fetchStockData(symbols[0], selectedPeriod);
          },
          error: (error) => {
            setError(`Failed to parse CSV file: ${error.message}`);
            setLoading(false);
          }
        });
      } catch (error) {
        setError(`Failed to load CSV file: ${error.message}`);
        setLoading(false);
      }
    };
    
    if (typeof window !== 'undefined') {
      loadCSV();
    }

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  const fetchStockData = useCallback(async (symbol, period) => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      const days = TIME_PERIODS.find(t => t.label === period)?.days || 90;
      startDate.setDate(startDate.getDate() - days);

      const response = await axios.get('/api/stockData', {
        params: { symbol, startDate: startDate.toISOString(), endDate: endDate.toISOString() }
      });

      if (response.data?.length) {
        const formattedData = response.data.map(item => ({
          time: new Date(item.time).getTime() / 1000,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume)
        }));
        
        setChartData(formattedData);
        
        const lastItem = formattedData[formattedData.length - 1];
        const prevItem = formattedData[formattedData.length - 2];
        const change = ((lastItem.close - prevItem.close) / prevItem.close * 100).toFixed(2);
        
        setCurrentStats({
          current: lastItem.close.toFixed(2),
          change: change,
          high: lastItem.high.toFixed(2),
          low: lastItem.low.toFixed(2),
          volume: (lastItem.volume / 1000000).toFixed(2) + 'M'
        });
      } else {
        setError('No data available for this symbol');
      }
    } catch (error) {
      setError(error.response?.data?.details || 'Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize and update chart
  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length || typeof window === 'undefined') return;

    const initChart = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
      }

      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: getChartHeight(),
        layout: {
          background: { type: 'solid', color: '#ffffff' },
          textColor: '#333'
        },
        grid: {
          vertLines: { color: '#f0f0f0' },
          horzLines: { color: '#f0f0f0' }
        },
        crosshair: {
          mode: CrosshairMode.Normal
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          minBarSpacing: 5,
        },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });

      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      candleSeries.setData(chartData);
      volumeSeries.setData(
        chartData.map(item => ({
          time: item.time,
          value: item.volume,
          color: item.close > item.open ? '#26a69a' : '#ef5350'
        }))
      );

      chart.timeScale().fitContent();
      chartInstanceRef.current = chart;

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }

      resizeObserverRef.current = new ResizeObserver(entries => {
        if (chartInstanceRef.current) {
          const { width } = entries[0].contentRect;
          chartInstanceRef.current.applyOptions({ 
            width,
            height: getChartHeight()
          });
          chartInstanceRef.current.timeScale().fitContent();
        }
      });

      resizeObserverRef.current.observe(chartContainerRef.current);
    };

    const timer = setTimeout(initChart, 0);
    return () => clearTimeout(timer);
  }, [chartData, getChartHeight]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      fetchStockData(stockSymbols[currentIndex - 1], selectedPeriod);
    }
  };

  const handleNext = () => {
    if (currentIndex < stockSymbols.length - 1) {
      setCurrentIndex(prev => prev + 1);
      fetchStockData(stockSymbols[currentIndex + 1], selectedPeriod);
    }
  };

  return (
    <div className="d-flex flex-column vh-100">
      {/* Header */}
      <header className="bg-primary text-white py-3">
        <div className="container-fluid">
          <div className="row align-items-center">
            <div className="col">
              <div className="d-flex align-items-center">
                <h1 className="h4 mb-0 me-3">Stock Charts</h1>
                <h2 className="h5 mb-0 me-3">{stockSymbols[currentIndex]}</h2>
                {currentStats && (
                  <div className="d-none d-md-flex align-items-center">
                    <span className="fw-bold me-3">₹{currentStats.current}</span>
                    <span className={`me-3 ${currentStats.change >= 0 ? 'text-success' : 'text-danger'}`}>
                      {currentStats.change}%
                    </span>
                    <span className="me-3">H: ₹{currentStats.high}</span>
                    <span className="me-3">L: ₹{currentStats.low}</span>
                    <span>Vol: {currentStats.volume}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="col-auto">
              <Dropdown>
                <Dropdown.Toggle variant="light" id="time-period-dropdown">
                  {selectedPeriod}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {TIME_PERIODS.map((period) => (
                    <Dropdown.Item 
                      key={period.label}
                      onClick={() => {
                        setSelectedPeriod(period.label);
                        fetchStockData(stockSymbols[currentIndex], period.label);
                      }}
                    >
                      {period.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow-1 position-relative">
        {loading ? (
          <ChartLoadingPlaceholder />
        ) : error ? (
          <div className="h-100 d-flex align-items-center justify-content-center">
            <Alert variant="danger">
              <Alert.Heading>Error Loading Chart</Alert.Heading>
              <p className="mb-0">{error}</p>
            </Alert>
          </div>
        ) : (
          <div ref={chartContainerRef} className="position-absolute top-0 start-0 w-100 h-100" />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-light border-top py-3">
        <div className="container-fluid">
          <div className="row align-items-center">
            <div className="col">
              <Button 
                variant="outline-primary"
                disabled={currentIndex === 0}
                onClick={handlePrevious}
              >
                Previous
              </Button>
            </div>
            <div className="col text-center">
              {currentIndex + 1} / {stockSymbols.length}
            </div>
            <div className="col text-end">
              <Button 
                variant="outline-primary"
                disabled={currentIndex === stockSymbols.length - 1}
                onClick={handleNext}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default StockChart;
