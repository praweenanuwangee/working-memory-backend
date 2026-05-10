export const healthCheck = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Working memory backend is running',
    timestamp: new Date().toISOString(),
  });
};