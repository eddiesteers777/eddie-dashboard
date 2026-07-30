// ==============================
// EddieOS Analytics Dashboard
// ==============================

// Weekly Mileage Chart

const canvas = document.getElementById("weeklyMileageChart");

const ctx = canvas.getContext("2d");

// Gradient Fill

const gradient = ctx.createLinearGradient(0, 0, 0, 450);

gradient.addColorStop(0, "rgba(59,130,246,.45)");
gradient.addColorStop(.35, "rgba(59,130,246,.20)");
gradient.addColorStop(1, "rgba(59,130,246,0)");

new Chart(ctx, {

    type: "line",

    data: {

        labels: [

            "Jun 8",
            "Jun 15",
            "Jun 22",
            "Jun 29",
            "Jul 6",
            "Jul 13",
            "Jul 20",
            "Jul 27"

        ],

        datasets: [

            {

                label: "Weekly Mileage",

                data: [

                    28,
                    32,
                    35,
                    40,
                    43,
                    46,
                    48,
                    44

                ],

                fill: true,

                backgroundColor: gradient,

                borderColor: "#3b82f6",

                borderWidth: 4,

                tension: .45,

                pointRadius: 0,

                pointHoverRadius: 8,

                pointHoverBorderWidth: 3,

                pointHoverBackgroundColor: "#ffffff",

                pointHoverBorderColor: "#3b82f6"

            }

        ]

    },

    options: {

        responsive: true,

        maintainAspectRatio: false,

        interaction: {

            intersect: false,

            mode: "index"

        },

        animation: {

            duration: 1600,

            easing: "easeOutQuart"

        },

        plugins: {

            legend: {

                display: false

            },

            tooltip: {

                backgroundColor: "#0f172a",

                padding: 14,

                cornerRadius: 12,

                displayColors: false,

                titleColor: "#ffffff",

                bodyColor: "#ffffff",

                callbacks: {

                    label: function(context) {

                        return context.raw + " miles";

                    }

                }

            }

        },

        scales: {

            x: {

                grid: {

                    display: false

                },

                ticks: {

                    color: "#64748b"

                }

            },

            y: {

                beginAtZero: true,

                suggestedMax: 55,

                ticks: {

                    stepSize: 10,

                    color: "#64748b"

                },

                grid: {

                    color: "rgba(148,163,184,.18)"

                }

            }

        }

    }

});
