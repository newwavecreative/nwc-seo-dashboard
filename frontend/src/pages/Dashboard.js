import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../styles/Dashboard.css';

// In production, use relative /api; in dev, use localhost
const API_URL = process.env.REACT_APP_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001');

// Helper to format % change with color
const ChangeIndicator = ({ value, inverted = false }) => {
  if (value === null || value === undefined) return null;
  
  // If inverted (like for position), flip the color logic
  const isPositive = inverted ? value < 0 : value > 0;
  const color = isPositive ? '#10b981' : '#ef4444'; // green for positive, red for negative
  const symbol = value > 0 ? '+' : '';
  
  return (
    <span style={{ color, fontWeight: 'bold', fontSize: '0.85em' }}>
      {symbol}{value}%
    </span>
  );
};

function Dashboard({ token, user, onLogout }) {
  const [summary, setSummary] = useState(null);
  const [topKeywords, setTopKeywords] = useState([]);
  const [topPages, setTopPages] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [keywordsComparison, setKeywordsComparison] = useState([]);
  const [pagesComparison, setPagesComparison] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      const [summaryRes, keywordsRes, pagesRes, compRes, keywordsCompRes, pagesCompRes] = await Promise.all([
        axios.get(`${API_URL}/seo/summary`, { headers }),
        axios.get(`${API_URL}/seo/top-keywords`, { headers }),
        axios.get(`${API_URL}/seo/top-pages`, { headers }),
        axios.get(`${API_URL}/seo/comparison`, { headers }),
        axios.get(`${API_URL}/seo/top-keywords-comparison`, { headers }),
        axios.get(`${API_URL}/seo/top-pages-comparison`, { headers }),
      ]);

      setSummary(summaryRes.data);
      setTopKeywords(keywordsRes.data);
      setTopPages(pagesRes.data);
      setComparison(compRes.data);
      setKeywordsComparison(keywordsCompRes.data);
      setPagesComparison(pagesCompRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return <div className="dashboard"><p>Loading...</p></div>;
  }

  const displaySummary = showComparison ? comparison?.current : summary;
  const displayKeywords = showComparison ? keywordsComparison : topKeywords;
  const displayPages = showComparison ? pagesComparison : topPages;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>SEO Dashboard</h1>
          {showComparison && <p style={{ fontSize: '0.9em', color: '#666', margin: '4px 0 0 0' }}>30-day comparison view</p>}
        </div>
        <div className="header-controls">
          <button 
            className={`toggle-button ${showComparison ? 'active' : ''}`}
            onClick={() => setShowComparison(!showComparison)}
            title="Compare current 30 days vs previous 30 days"
          >
            {showComparison ? '📊 Hide Comparison' : '📊 Show Comparison'}
          </button>
          <div className="user-info">
            <span>{user?.name || user?.email}</span>
            <button onClick={onLogout}>Logout</button>
          </div>
        </div>
      </header>

      <div className="summary-cards">
        <div className="card">
          <h3>Total Impressions {showComparison ? '(Last 30d)' : '(30d)'}</h3>
          <p className="big-number">{displaySummary?.total_impressions || 0}</p>
          {showComparison && comparison?.change && (
            <p className="change-indicator">
              <ChangeIndicator value={comparison.change.total_impressions_pct} />
            </p>
          )}
        </div>
        <div className="card">
          <h3>Total Clicks {showComparison ? '(Last 30d)' : '(30d)'}</h3>
          <p className="big-number">{displaySummary?.total_clicks || 0}</p>
          {showComparison && comparison?.change && (
            <p className="change-indicator">
              <ChangeIndicator value={comparison.change.total_clicks_pct} />
            </p>
          )}
        </div>
        <div className="card">
          <h3>Avg Position</h3>
          <p className="big-number">{displaySummary?.avg_position || '--'}</p>
          {showComparison && comparison?.change && (
            <p className="change-indicator">
              <ChangeIndicator value={comparison.change.avg_position_pct} inverted={true} />
            </p>
          )}
        </div>
        <div className="card">
          <h3>Keywords</h3>
          <p className="big-number">{displaySummary?.total_queries || 0}</p>
          {showComparison && comparison?.change && (
            <p className="change-indicator">
              <ChangeIndicator value={comparison.change.total_queries_pct} />
            </p>
          )}
        </div>
      </div>

      <div className="charts-container">
        <div className="chart-box">
          <h2>Top Keywords {showComparison ? '(30d with comparison)' : '(30d)'}</h2>
          {displayKeywords.length > 0 ? (
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th>Impressions</th>
                    {showComparison && <th>Change</th>}
                    <th>Clicks</th>
                    {showComparison && <th>Change</th>}
                    <th>CTR (%)</th>
                    <th>Avg Position</th>
                    {showComparison && <th>Change</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayKeywords.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.query}</td>
                      <td>{item.total_impressions}</td>
                      {showComparison && <td><ChangeIndicator value={item.impressions_pct} /></td>}
                      <td>{item.total_clicks}</td>
                      {showComparison && <td><ChangeIndicator value={item.clicks_pct} /></td>}
                      <td>{item.ctr}</td>
                      <td>{item.avg_position}</td>
                      {showComparison && <td><ChangeIndicator value={item.position_pct} inverted={true} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No data yet. Check back after the first GSC sync.</p>
          )}
        </div>

        <div className="chart-box">
          <h2>Top Pages {showComparison ? '(30d with comparison)' : '(30d)'}</h2>
          {displayPages.length > 0 ? (
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Impressions</th>
                    {showComparison && <th>Change</th>}
                    <th>Clicks</th>
                    {showComparison && <th>Change</th>}
                    <th>CTR (%)</th>
                    <th>Avg Position</th>
                    {showComparison && <th>Change</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayPages.map((item, idx) => (
                    <tr key={idx}>
                      <td className="url">{item.page_url}</td>
                      <td>{item.total_impressions}</td>
                      {showComparison && <td><ChangeIndicator value={item.impressions_pct} /></td>}
                      <td>{item.total_clicks}</td>
                      {showComparison && <td><ChangeIndicator value={item.clicks_pct} /></td>}
                      <td>{item.ctr}</td>
                      <td>{item.avg_position}</td>
                      {showComparison && <td><ChangeIndicator value={item.position_pct} inverted={true} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No data yet. Check back after the first GSC sync.</p>
          )}
        </div>
      </div>

      <button onClick={() => fetchData()} className="refresh-button">Refresh Data</button>
    </div>
  );
}

export default Dashboard;
