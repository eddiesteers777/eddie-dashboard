const ctx = document.getElementById("weeklyMileageChart");

new Chart(ctx, {

    type: "line",

    data: {

        labels: [
            "Week 1",
            "Week 2",
            "Week 3",
            "Week 4",
            "Week 5",
            "Week 6",
            "Week 7",
            "Week 8"
        ],

        datasets: [

            {

                label: "Miles",

                data: [
                    28,
                    32,
                    36,
                    40,
                    42,
                    44,
                    48,
                    44
                ],

                borderColor: "#2563eb",

                backgroundColor: "rgba(37,99,235,.15)",

                fill: true,

                tension: .35,

                borderWidth: 3,

                pointRadius: 5,

                pointHoverRadius: 7

            }

        ]

    },

    options: {

        responsive: true,

        maintainAspectRatio: false,

        plugins: {

            legend: {

                display: false

            }

        },

        scales: {

            y: {

                beginAtZero: true,

                ticks: {

                    stepSize: 10

                }

            }

        }

    }

});
